import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import Customers from './Customers';
import { loadUserApiConfig } from '../services/users';

const initial = {
  RowID: '9223372036854775807', RowName: 'مشتری نمونه', ShopName: 'فروشگاه نمونه', Address: 'تهران',
  ContractDate: '2026-10-15T12:34:56', EndDate: null, ActiveToken: 'saved-activation', LastTry: '2026-10-14T10:10:10Z',
  UniqueCode: '00112233-4455-6677-8899-aabbccddeeff', ID: '9007199254740993', UserID: '0',
  UserName: 'shop', Password: 'saved-password', MobileNumber: '09120000000',
};
const response = data => ({ ok: true, status: 200, text: async () => JSON.stringify(data), json: async () => data });

afterEach(() => { cleanup(); sessionStorage.clear(); });

test('Customer screen loads, edits with all fields, retains failed edits, inserts, searches and switches API address', async () => {
  let records = [{ ...initial }], address = '/mock-a', rejectUpdate = false;
  const calls = [];
  global.fetch = jest.fn(async (url, init = {}) => {
    expect(Object.keys(init.headers || {}).some(key => key.toLowerCase() === 'authorization')).toBe(false);
    if (url === '/user-api.config.json') {
      expect(init.headers?.Token).toBeUndefined();
      return response({ apiUrl: address });
    }
    expect(init.headers.Token).toBe('mock-token');
    const operation = url.split('/').pop();
    const data = Object.fromEntries(new URLSearchParams(init.body || ''));
    calls.push({ url, operation, data });
    const result = { StatusCode: 200, StatusMessage: 'ذخیره شد' };
    if (operation === 'GetCoustomer') return response({ coustomerModels: records, ResaultClass: result });
    if (operation === 'GetCoustomerByID') return response({ coustomerModels: records.filter(item => item.RowID === data.RowID), ResaultClass: result });
    if (operation === 'InsertCoustomer') records.push({ ...data, RowID: '10' });
    if (operation === 'UpdateCoustomer') {
      if (rejectUpdate) return response({ StatusCode: 409, StatusMessage: 'خطای آزمایشی ذخیره' });
      records = records.map(item => item.RowID === data.RowID ? data : item);
    }
    return response(result);
  });
  Element.prototype.scrollIntoView = jest.fn();
  window.history.replaceState({}, '', '/customers');
  sessionStorage.setItem('userApiSession.v1', JSON.stringify({ token: 'mock-token', user: { RowID: '1', RowName: 'کاربر آزمایشی', UserName: 'test', UseType: null, Mobile: '', IsActive: true } }));
  render(<Customers />);
  const editButton = await screen.findByRole('button', { name: 'ویرایش مشتری نمونه', exact: true });
  await act(async () => { fireEvent.click(editButton); });
  await screen.findByRole('heading', { name: 'ویرایش مشتری', exact: true });
  expect(screen.getByLabelText('رمز عبور')).toHaveValue('saved-password');
  expect(screen.getByLabelText('رمز عبور')).toHaveAttribute('type', 'password');
  expect(screen.getByLabelText('شماره موبایل')).not.toBeRequired();
  expect(screen.getByLabelText('رمز عبور')).not.toBeRequired();
  expect(screen.queryByLabelText('تاریخ شروع قرارداد')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('تاریخ پایان قرارداد')).not.toBeInTheDocument();
  expect(screen.queryByText('اطلاعات تکمیلی')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('توکن فعال‌سازی')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('نام مشتری'), { target: { value: 'مشتری ویرایش شده' } });
  rejectUpdate = true;
  fireEvent.click(screen.getByRole('button', { name: 'ذخیره تغییرات', exact: true }));
  await screen.findByText('خطای آزمایشی ذخیره');
  expect(screen.getByLabelText('نام مشتری')).toHaveValue('مشتری ویرایش شده');
  rejectUpdate = false;
  fireEvent.click(screen.getByRole('button', { name: 'ذخیره تغییرات', exact: true }));
  await screen.findByRole('button', { name: 'ویرایش مشتری ویرایش شده', exact: true });
  const update = calls.filter(call => call.operation === 'UpdateCoustomer').pop();
  expect(update.data).toEqual({ ...initial, RowName: 'مشتری ویرایش شده', EndDate: '' });
  expect(Object.keys(update.data)).toHaveLength(14);
  await waitFor(() => expect(screen.getByRole('button', { name: 'افزودن مشتری', exact: true })).toBeEnabled());
  fireEvent.change(screen.getByLabelText('نام مشتری'), { target: { value: 'مشتری جدید' } });
  fireEvent.change(screen.getByLabelText('نام فروشگاه'), { target: { value: 'فروشگاه جدید' } });
  fireEvent.change(screen.getByLabelText('شماره موبایل'), { target: { value: '09123456789' } });
  fireEvent.change(screen.getByLabelText('آدرس'), { target: { value: 'دزفول' } });
  fireEvent.change(screen.getByLabelText('نام کاربری'), { target: { value: 'new-shop' } });
  fireEvent.change(screen.getByLabelText('رمز عبور'), { target: { value: 'new-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'افزودن مشتری', exact: true }));
  await screen.findByRole('button', { name: 'ویرایش مشتری جدید', exact: true });
  const insert = calls.find(call => call.operation === 'InsertCoustomer');
  expect(insert.data.ContractDate).toBe('');
  expect(insert.data.EndDate).toBe('');
  expect(insert.data.ActiveToken).toBe('');
  expect(insert.data.ID).toBe('');
  expect(insert.data.RowID).toBe('0');
  expect(Object.keys(insert.data)).toHaveLength(14);
  await waitFor(() => expect(screen.getByRole('button', { name: 'به‌روزرسانی لیست' })).toBeEnabled());
  expect(screen.queryByPlaceholderText('دریافت مشتری با شناسه')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('جستجوی مشتریان'), { target: { value: 'مشتری ویرایش شده' } });
  fireEvent.click(screen.getByRole('button', { name: 'ویرایش مشتری ویرایش شده', exact: true }));
  await screen.findByRole('heading', { name: 'ویرایش مشتری', exact: true });
  expect(calls.filter(call => call.operation === 'GetCoustomerByID').pop().data).toEqual({ RowID: initial.RowID });
  await waitFor(() => expect(screen.getByRole('button', { name: 'انصراف از ویرایش' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'انصراف از ویرایش' }));
  address = '/mock-b';
  await loadUserApiConfig.refresh();
  fireEvent.click(screen.getByRole('button', { name: 'به‌روزرسانی لیست' }));
  await waitFor(() => expect(calls.filter(call => call.operation === 'GetCoustomer').pop().url).toBe('/mock-b/GetCoustomer'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'به‌روزرسانی لیست' })).toBeEnabled());
});


test('Successful null list shows no customers instead of an error', async () => {
  global.fetch = jest.fn(async url => response(url === '/user-api.config.json'
    ? { apiUrl: '/mock-null' }
    : { coustomerModels: null, ResaultClass: { StatusCode: 200, StatusMessage: 'ورود موفق' } }));
  sessionStorage.setItem('userApiSession.v1', JSON.stringify({ token: 'mock-token', user: { RowID: '1', RowName: 'کاربر آزمایشی', UserName: 'test', UseType: null, Mobile: '', IsActive: true } }));
  render(<Customers />);
  await screen.findByText('هنوز مشتری وجود ندارد.');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('تاریخ شروع قرارداد')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('تاریخ پایان قرارداد')).not.toBeInTheDocument();
  expect(screen.queryByText('اطلاعات تکمیلی')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'افزودن مشتری', exact: true })).toBeEnabled();
  for (const label of ['نام مشتری', 'نام فروشگاه', 'شماره موبایل', 'آدرس', 'نام کاربری', 'رمز عبور']) {
    const input = screen.getByLabelText(label);
    expect(input).toBeRequired();
    expect(input.labels[0].querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
    expect(input.validity.valueMissing).toBe(true);
  }
  const registrationForm = screen.getByLabelText('نام مشتری').form;
  expect(registrationForm.checkValidity()).toBe(false);
  const before = global.fetch.mock.calls.length;
  fireEvent.submit(registrationForm);
  expect(global.fetch).toHaveBeenCalledTimes(before);
});
