
import qs from 'qs';
import {
  ApiError,
  field,
  messageOf,
  createApiRequest,
} from './apiTransport.mjs';
import {
  longValue,
  dateValue,
  nullableList,
} from './modelValues.mjs';

// Contract RowID is owned by the backend. Keep its exact integer text, but do
// not reject zero, negative values or values outside JavaScript/.NET ranges.
function contractRowIDValue(value) {
  const text = String(value ?? '').trim();
  if (
    (typeof value === 'number' && !Number.isSafeInteger(value)) ||
    !/^-?\d+$/.test(text)
  ) {
    throw new ApiError('شناسه قرارداد باید عدد صحیح معتبر باشد.');
  }
  return text;
}

export function buildContractPayload(model = {}, { update = false } = {}) {
  const active =
    model.IsActive === '' || model.IsActive == null
      ? null
      : model.IsActive;

  if (active !== null && typeof active !== 'boolean') {
    throw new ApiError('وضعیت قرارداد معتبر نیست.');
  }

  return {
    RowID: update
      ? contractRowIDValue(model.RowID)
      : '0',
    Mdate: dateValue(model.Mdate, 'شروع قرارداد'),
    Fdate: String(model.Fdate ?? ''),
    EndDate: dateValue(model.EndDate, 'پایان قرارداد'),
    // Id is the selected customer's RowID, not the customer's separate ID.
    Id: longValue(model.Id, 'مشتری', { nullable: true }),
    IsActive: active,
    FEndDate: String(model.FEndDate ?? ''),
  };
}

export function normalizeContract(model) {
  if (!model || typeof model !== 'object' || Array.isArray(model)) {
    throw new ApiError('اطلاعات قرارداد در پاسخ سرور معتبر نیست.');
  }

  const keys = [
    'RowID',
    'Mdate',
    'Fdate',
    'EndDate',
    'Id',
    'IsActive',
    'FEndDate',
  ];

  const values = Object.fromEntries(
    keys.map(key => [key, field(model, key)])
  );

  values.RowID ??= model.rowId;

  return {
    ...buildContractPayload(values, { update: true }),
    Name: String(field(model, 'Name') ?? ''),
    ShopName: String(field(model, 'ShopName') ?? ''),
    MobileNumber: String(field(model, 'MobileNumber') ?? ''),
  };
}

export function createContractApi(options) {
  const request = createApiRequest({
    ...options,
    serializePayload: payload => qs.stringify(payload),
    contentTypeOnEmptyRequest: true,
  });

  const listFrom = data =>
    nullableList(
      data,
      'ContractModels',
      'لیست قراردادها در پاسخ سرور معتبر نیست.'
    ).map(normalizeContract);

  return {
    async getContracts(requestOptions) {
      return listFrom(
        await request('GetAllContract', undefined, requestOptions)
      );
    },

    async getContractsByCustomer(rowID, requestOptions) {
      const id = longValue(rowID, 'شناسه مشتری', {
        positive: true,
      });
      return listFrom(
        await request('GetContract', { RowID: id }, requestOptions)
      );
    },

    async insertContract(model) {
      return (
        messageOf(
          await request(
            'InsertContract',
            buildContractPayload(model)
          )
        ) || 'قرارداد جدید ثبت شد.'
      );
    },

    async updateContract(model) {
      return (
        messageOf(
          await request(
            'UpdateContract',
            buildContractPayload(model, { update: true })
          )
        ) || 'تغییرات قرارداد ذخیره شد.'
      );
    },
  };
}
