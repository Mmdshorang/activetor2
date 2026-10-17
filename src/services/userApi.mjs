import qs from 'qs';

// API responses remain JSON; model inputs are URL-encoded forms.
import { ApiError, field, messageOf, createApiRequest } from './apiTransport.mjs';
export { ApiError, field, parseApiJson } from './apiTransport.mjs';

export function normalizeRowID(value, allowZero = false) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new ApiError('شناسه کاربر دقت معتبر ندارد.');
  const id = String(value ?? '').trim();
  if (!/^\d+$/.test(id) || BigInt(id) > BigInt('9223372036854775807') || (!allowZero && BigInt(id) === BigInt(0))) {
    throw new ApiError('شناسه کاربر باید یک عدد صحیح مثبت معتبر باشد.');
  }
  return BigInt(id).toString();
}

export function normalizeUser(model) {
  if (!model || typeof model !== 'object' || Array.isArray(model)) throw new ApiError('اطلاعات کاربر در پاسخ سرور معتبر نیست.');
  const useType = field(model, 'UseType');
  const active = field(model, 'IsActive');
  if (typeof active !== 'boolean') throw new ApiError('وضعیت فعال بودن کاربر در پاسخ سرور معتبر نیست.');
  if (useType != null && (!Number.isInteger(useType) || useType < -2147483648 || useType > 2147483647)) throw new ApiError('نوع کاربر در پاسخ سرور معتبر نیست.');
  return {
    RowID: normalizeRowID(field(model, 'RowID') ?? model.rowId),
    RowName: String(field(model, 'RowName') ?? ''),
    UserName: String(field(model, 'UserName') ?? ''),
    UseType: useType ?? null,
    Mobile: String(field(model, 'Mobile') ?? ''),
    IsActive: active,
  };
}

// Keep every LoginModel field, including empty strings, null, zero and false.
// Login and lookup supply only their meaningful values; other fields use defaults.
export function buildLoginModelPayload(model = {}) {
  return {
    RowID: normalizeRowID(model.RowID ?? '0', true),
    RowName: String(model.RowName ?? ''),
    UserName: String(model.UserName ?? ''),
    Password: String(model.Password ?? ''),
    UseType: model.UseType ?? null,
    Mobile: String(model.Mobile ?? ''),
    Token: String(model.Token ?? ''),
    IsActive: model.IsActive ?? false,
  };
}

export function buildUserPayload(model, { update = false, passwordMode = 'required' } = {}) {
  const userName = String(model.UserName ?? '').trim();
  if (!userName) throw new ApiError('نام کاربری را وارد کنید.');
  const password = String(model.Password ?? '');
  if (!password && (!update || passwordMode !== 'empty')) throw new ApiError('رمز عبور را وارد کنید.');
  const rawUseType = model.UseType;
  const useType = rawUseType === '' || rawUseType == null ? null : Number(rawUseType);
  if (useType !== null && (!Number.isInteger(useType) || useType < -2147483648 || useType > 2147483647)) throw new ApiError('نوع کاربر باید یک عدد صحیح باشد.');
  if (typeof model.IsActive !== 'boolean') throw new ApiError('وضعیت فعال بودن کاربر معتبر نیست.');
  return buildLoginModelPayload({
    RowID: update ? normalizeRowID(model.RowID) : '0',
    RowName: String(model.RowName ?? '').trim(),
    UserName: userName,
    Password: password,
    UseType: useType,
    Mobile: String(model.Mobile ?? '').trim(),
    Token: String(model.Token ?? ''),
    IsActive: model.IsActive,
  });
}

export function serializePayload(payload) {
  // qs keeps null as an empty form value (UseType=) and preserves 64-bit IDs
  // as decimal strings. Do not use skipNulls or filter away falsy fields.
  const formData = qs.stringify(buildLoginModelPayload(payload));
  return formData;
}

export function createUserApi(options) {
  const { getConfig } = options;
  const request = createApiRequest({ ...options, serializePayload });
  const listFrom = data => {
    const list = field(data, 'LoginModel');
    if (!Array.isArray(list)) throw new ApiError('لیست کاربران در پاسخ سرور معتبر نیست.');
    return list.map(normalizeUser);
  };
  return {
    async login(userName, password) {
      if (!String(userName).trim() || !password) throw new ApiError('نام کاربری و رمز عبور را وارد کنید.');
      const data = await request('Login', { UserName: String(userName).trim(), Password: password });
      const model = field(data, 'LoginModel');
      const user = normalizeUser(model);
      const token = field(model, 'Token');
      if (!user.IsActive) throw new ApiError('حساب کاربری غیرفعال است.');
      if (typeof token !== 'string' || !token.trim()) throw new ApiError('سرور توکن ورود معتبر برنگرداند.');
      return { token: token.trim(), user };
    },
    async getUsers(options) { return listFrom(await request('GetUser', undefined, options)); },
    async getUserByID(rowID, options) {
      const id = normalizeRowID(rowID);
      const users = listFrom(await request('GetUserByID', { RowID: id }, options));
      const user = users.find(item => item.RowID === id);
      if (!user) throw new ApiError('کاربر موردنظر پیدا نشد.');
      return user;
    },
    async insertUser(model) {
      const data = await request('InsertUser', buildUserPayload(model));
      return messageOf(data) || 'کاربر جدید اضافه شد.';
    },
    async updateUser(model) {
      const config = await getConfig();
      const data = await request('Updateuser', buildUserPayload(model, { update: true, passwordMode: config.updatePasswordMode }));
      return messageOf(data) || 'تغییرات کاربر ذخیره شد.';
    },
  };
}
