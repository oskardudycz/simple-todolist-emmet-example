import {JSONReplacer, JSONReplacers, composeJSONReplacers} from '@event-driven-io/emmett';

const downcastSafeBigInt: JSONReplacer = (_key, value) =>
    typeof value === 'bigint' && Number.isSafeInteger(Number(value)) ? Number(value) : value;

export const jsonReplacer = composeJSONReplacers(downcastSafeBigInt, JSONReplacers.bigInt);
