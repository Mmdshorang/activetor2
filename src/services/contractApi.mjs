
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
      ? longValue(model.RowID, 'شناسه قرارداد', { positive: true })
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

  return buildContractPayload(values, { update: true });
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
        await request('GetContract', undefined, requestOptions)
      );
    },

    async getContractByID(rowID, requestOptions) {
      const id = longValue(rowID, 'شناسه قرارداد', {
        positive: true,
      });

      const contracts = listFrom(
        await request(
          'GetContractByID',
          { RowID: id },
          requestOptions
        )
      );

      const contract = contracts.find(
        item => item.RowID === id
      );

      if (!contract) {
        throw new ApiError('قرارداد موردنظر پیدا نشد.');
      }

      return contract;
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
