function readFieldCode(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const code = value.trim();
  return code || undefined;
}

export function getDetailViewFieldCodes(fieldList: Array<Record<string, unknown>> | null | undefined): string[] {
  const codes = (fieldList ?? []).map((field) => (
    readFieldCode(field.fieldCode)
    ?? readFieldCode(field.field_code)
    ?? readFieldCode(field.code)
    ?? readFieldCode(field.sameAs)
  ));
  return Array.from(new Set(codes.filter((code): code is string => Boolean(code))));
}
