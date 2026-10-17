import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import Contracts from './Contracts';
import { loadUserApiConfig } from '../services/users';

const initial = { RowID: '9223372036854775807', Mdate: '2026-10-15T12:34:56', Fdate: '1405/07/23', EndDate: null, Id: '9007199254740993', IsActive: true, FEndDate: '' };
const customers = [
  { RowID: initial.Id, ID: '15', RowName: 'مشتری نمونه', ShopName: 'فروشگاه نمونه', MobileNumber: '09120000000' },
  { RowID: '9223372036854775806', ID: '16', RowName: 'مشتری دوم', ShopName: 'فروشگاه دوم', MobileNumber: '09121111111' },
];
const response = data => ({ ok: true, status: 200, text: async () => JSON.stringify(data), json: async () => data });
const seedSession = () => sessionStorage.setItem('userApiSession.v1', JSON.stringify({ token: 'mock-token', user: { RowID: '1', RowName: 'کاربر آزمایشی', UserName: 'test', UseType: null, Mobile: '', IsActive: true } }));
const fromWire = data => ({ ...data, Id: data.Id || null, Mdate: data.Mdate || null, EndDate: data.EndDate || null, IsActive: data.IsActive === '' ? null : data.IsActive === 'true' });
afterEach(() => { cleanup(); sessionStorage.clear(); });

test('Contract form creates/edits dates and nullable fields with exact RowID, handles failures and uses refreshed Token API', async () => {
  let records = [{ ...initial }], address = '/mock-contracts-a', rejectUpdate = false;
  const calls = [];
  global.fetch = jest.fn(async (url, init = {}) => {
    expect(Object.keys(init.headers || {}).some(key => key.toLowerCase() === 'authorization')).toBe(false);
    if (url === '/user-api.config.json') return response({ apiUrl: address });
    expect(init.headers.Token).toBe('mock-token');
    const operation = url.split('/').pop();
    const data = Object.fromEntries(new URLSearchParams(init.body || ''));
    calls.push({ url, operation, data });
    const result = { StatusCode: 200, StatusMessage: 'ذخیره شد' };
    if (operation === 'GetCoustomer') return response({ coustomerModels: customers, ResaultClass: result });
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded;charset=UTF-8');
    if (operation === 'GetAllContract') return response({ contractModels: records, ResaultClass: result });
    if (operation === 'GetContract') {
      const selected = customers.find(item => item.RowID === data.RowID);
      return response({ contractModels: records.filter(item => item.Id === data.RowID).map(item => ({ ...item, Name: selected?.RowName, ShopName: selected?.ShopName, MobileNumber: selected?.MobileNumber })), ResaultClass: result });
    }
    if (operation === 'InsertContract') records.push({ ...fromWire(data), RowID: '10' });
    if (operation === 'UpdateContract') {
      if (rejectUpdate) return response({ StatusCode: 409, StatusMessage: 'خطای آزمایشی ذخیره' });
      records = records.map(item => item.RowID === data.RowID ? fromWire(data) : item);
    }
    return response(result);
  });
  Element.prototype.scrollIntoView = jest.fn();
  seedSession();
  render(<Contracts />);
  const edit = await screen.findByRole('button', { name: `ویرایش قرارداد ${initial.RowID}`, exact: true });
  await waitFor(() => expect(edit).toBeEnabled());
  await act(async () => { fireEvent.click(edit); });
  expect(screen.getByLabelText('مشتری قرارداد').closest('.rs__control')).toHaveTextContent('مشتری نمونه');
  expect(screen.queryByLabelText('شناسه مرتبط (Id)')).not.toBeInTheDocument();
  expect(screen.queryByText('تعداد فاکتور')).not.toBeInTheDocument();
  expect(screen.getByLabelText('تاریخ شروع قرارداد')).toHaveValue('1405/07/23');
  fireEvent.click(screen.getAllByRole('button', { name: 'باز کردن تقویم' })[0]);
  expect((await screen.findByRole('dialog', { name: 'انتخاب تاریخ' })).parentElement).toBe(document.body);
  fireEvent.blur(screen.getByLabelText('تاریخ شروع قرارداد'));
  fireEvent.change(screen.getByLabelText('وضعیت قرارداد'), { target: { value: 'false' } });
  rejectUpdate = true;
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'ذخیره تغییرات', exact: true })); });
  expect(await screen.findByText('خطای آزمایشی ذخیره')).toBeInTheDocument();
  expect(screen.getByLabelText('مشتری قرارداد').closest('.rs__control')).toHaveTextContent('مشتری نمونه');
  rejectUpdate = false;
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'ذخیره تغییرات', exact: true })); });
  await waitFor(() => expect(screen.getByRole('button', { name: 'ثبت قرارداد', exact: true })).toBeEnabled());
  const update = calls.filter(call => call.operation === 'UpdateContract').pop();
  expect(update.data).toEqual({ ...initial, IsActive: 'false', EndDate: '' });
  expect(Object.keys(update.data)).toHaveLength(7);
  fireEvent.change(screen.getByLabelText('مشتری قرارداد'), { target: { value: 'فروشگاه دوم' } });
  fireEvent.keyDown(screen.getByLabelText('مشتری قرارداد'), { key: 'ArrowDown', code: 'ArrowDown' });
  fireEvent.click(await screen.findByText(/مشتری دوم — فروشگاه دوم/));
  fireEvent.change(screen.getByLabelText('تاریخ شروع قرارداد'), { target: { value: '1405/07/23' } });
  fireEvent.blur(screen.getByLabelText('تاریخ شروع قرارداد'));
  fireEvent.change(screen.getByLabelText('تاریخ پایان قرارداد'), { target: { value: '1405/07/24' } });
  fireEvent.blur(screen.getByLabelText('تاریخ پایان قرارداد'));
  expect(screen.getByLabelText('وضعیت قرارداد')).toHaveValue('');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'ثبت قرارداد', exact: true })); });
  await screen.findByRole('button', { name: 'ویرایش قرارداد 10', exact: true });
  const insert = calls.find(call => call.operation === 'InsertContract');
  expect(insert.data).toEqual({ RowID: '0', Mdate: '2026-10-15', Fdate: '1405/07/23', EndDate: '2026-10-16', FEndDate: '1405/07/24', Id: customers[1].RowID, IsActive: '' });
  expect(screen.queryByPlaceholderText('دریافت قرارداد با شناسه')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('جستجوی قراردادها'), { target: { value: 'فروشگاه دوم' } });
  expect(screen.queryByRole('button', { name: `ویرایش قرارداد ${initial.RowID}`, exact: true })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'ویرایش قرارداد 10', exact: true })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('جستجوی قراردادها'), { target: { value: '' } });
  const contractCallsBeforeEdit = calls.filter(call => ['GetAllContract', 'GetContract'].includes(call.operation)).length;
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: `ویرایش قرارداد ${initial.RowID}`, exact: true })); });
  expect(calls.filter(call => ['GetAllContract', 'GetContract'].includes(call.operation))).toHaveLength(contractCallsBeforeEdit);
  await screen.findByRole('heading', { name: 'ویرایش قرارداد', exact: true });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'انصراف از ویرایش' })); });
  fireEvent.change(screen.getByLabelText('فیلتر وضعیت قرارداد'), { target: { value: 'null' } });
  expect(screen.getByRole('button', { name: 'ویرایش قرارداد 10', exact: true })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: `ویرایش قرارداد ${initial.RowID}`, exact: true })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('جستجوی قرارداد با نام مشتری'), { target: { value: 'مشتری دوم' } });
  fireEvent.keyDown(screen.getByLabelText('جستجوی قرارداد با نام مشتری'), { key: 'ArrowDown', code: 'ArrowDown' });
  fireEvent.click(await screen.findByText(/مشتری دوم — فروشگاه دوم/));
  await waitFor(() => expect(calls.filter(call => call.operation === 'GetContract').pop().data).toEqual({ RowID: customers[1].RowID }));
  expect(screen.getByRole('button', { name: 'ویرایش قرارداد 10', exact: true })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: `ویرایش قرارداد ${initial.RowID}`, exact: true })).not.toBeInTheDocument();
  address = '/mock-contracts-b';
  await loadUserApiConfig.refresh();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'به‌روزرسانی لیست' })); });
  expect(calls.filter(call => call.operation === 'GetContract').pop().url).toBe('/mock-contracts-b/GetContract');
  expect(calls.filter(call => call.operation === 'GetAllContract').length).toBeGreaterThan(0);
});

test('An empty customer list cannot submit a contract without a customer', async () => {
  const calls = [];
  global.fetch = jest.fn(async (url, init = {}) => {
    if (url === '/user-api.config.json') return response({ apiUrl: '/mock-empty' });
    calls.push(url);
    return response({ contractModels: null, coustomerModels: null, ResaultClass: { StatusCode: 200 } });
  });
  seedSession(); render(<Contracts />);
  await screen.findByText('هنوز قراردادی ثبت نشده است.');
  await screen.findByText('ابتدا از صفحه مشتریان، یک مشتری ثبت کنید.');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByLabelText('وضعیت قرارداد')).toHaveValue('');
  expect(screen.queryByText('تعداد فاکتور')).not.toBeInTheDocument();
  fireEvent.submit(screen.getByRole('button', { name: 'ثبت قرارداد', exact: true }).closest('form'));
  expect(await screen.findByText('لطفاً مشتری قرارداد را انتخاب کنید.')).toBeInTheDocument();
  expect(calls.some(url => url.endsWith('/InsertContract'))).toBe(false);
});

test('Customer loading failures are retryable while the contract list is retained', async () => {
  let failCustomers = true;
  global.fetch = jest.fn(async url => {
    if (url === '/user-api.config.json') return response({ apiUrl: '/mock-retry' });
    if (url.endsWith('/GetCoustomer')) {
      if (failCustomers) throw new Error('offline');
      return response({ coustomerModels: customers, ResaultClass: { StatusCode: 200 } });
    }
    return response({ contractModels: [initial], ResaultClass: { StatusCode: 200 } });
  });
  seedSession(); render(<Contracts />);
  const retry = await screen.findByRole('button', { name: 'تلاش مجدد دریافت مشتریان' });
  expect(screen.getByRole('button', { name: `ویرایش قرارداد ${initial.RowID}`, exact: true })).toBeInTheDocument();
  failCustomers = false;
  await act(async () => { fireEvent.click(retry); });
  expect(await screen.findByText('مشتری نمونه')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
