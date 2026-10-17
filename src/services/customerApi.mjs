import qs from 'qs';
import { ApiError, field, messageOf, createApiRequest } from './apiTransport.mjs';
import { longValue, dateValue, nullableList } from './modelValues.mjs';

function guidValue(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) {
    throw new ApiError('کد یکتا باید یک GUID معتبر باشد.');
  }
  return text;
}

// Every CoustomerModel property is present. qs encodes null as an empty form
// value; no zero, empty string or nullable field is filtered out.
export function buildCustomerPayload(model = {}, { update = false } = {}) {
  return {
    RowID: update ? longValue(model.RowID, 'شناسه مشتری', { positive: true }) : '0',
    RowName: String(model.RowName ?? ''),
    ShopName: String(model.ShopName ?? ''),
    Address: String(model.Address ?? ''),
    ContractDate: dateValue(model.ContractDate, 'شروع قرارداد'),
    EndDate: dateValue(model.EndDate, 'پایان قرارداد'),
    ActiveToken: String(model.ActiveToken ?? ''),
    LastTry: dateValue(model.LastTry, 'آخرین تلاش'),
    UniqueCode: guidValue(model.UniqueCode),
    ID: longValue(model.ID, 'ID', { nullable: true }),
    UserID: longValue(model.UserID, 'UserID', { nullable: true }),
    UserName: String(model.UserName ?? ''),
    Password: String(model.Password ?? ''),
    MobileNumber: String(model.MobileNumber ?? ''),
  };
}

export function normalizeCustomer(model) {
  if (!model || typeof model !== 'object' || Array.isArray(model)) throw new ApiError('اطلاعات مشتری در پاسخ سرور معتبر نیست.');
  const keys = ['RowID', 'RowName', 'ShopName', 'Address', 'ContractDate', 'EndDate', 'ActiveToken', 'LastTry', 'UniqueCode', 'ID', 'UserID', 'UserName', 'Password', 'MobileNumber'];
  const values = Object.fromEntries(keys.map(key => [key, field(model, key)]));
  values.RowID ??= model.rowId;
  values.UserID ??= model.userId;
  values.ID ??= model.id;
  return buildCustomerPayload(values, { update: true });
}

export function createCustomerApi(options) {
  const request = createApiRequest({ ...options, serializePayload: payload => qs.stringify(payload) });
  const listFrom = data => nullableList(data, 'CoustomerModels', 'لیست مشتریان در پاسخ سرور معتبر نیست.').map(normalizeCustomer);
  return {
    async getCustomers(options) {
      const customers = listFrom(await request('GetCoustomer', undefined, options));
      // Secrets are only retained in the edit form after a dedicated detail call.
      return customers.map(({ Password, ActiveToken, ...customer }) => customer);
    },
    async getCustomerByID(rowID, options) {
      const id = longValue(rowID, 'شناسه مشتری', { positive: true });
      // This endpoint explicitly accepts RowID only, unlike GetUserByID.
      const customers = listFrom(await request('GetCoustomerByID', { RowID: id }, options));
      const customer = customers.find(item => item.RowID === id);
      if (!customer) throw new ApiError('مشتری موردنظر پیدا نشد.');
      return customer;
    },
    async insertCustomer(model) {
      return messageOf(await request('InsertCoustomer', buildCustomerPayload(model))) || 'مشتری جدید اضافه شد.';
    },
    async updateCustomer(model) {
      return messageOf(await request('UpdateCoustomer', buildCustomerPayload(model, { update: true }))) || 'تغییرات مشتری ذخیره شد.';
    },
  };
}
