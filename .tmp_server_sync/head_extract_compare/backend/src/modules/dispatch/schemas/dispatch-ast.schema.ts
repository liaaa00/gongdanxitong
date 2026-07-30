export const dispatchAstSchema: Record<string, unknown> = {
  $id: 'DispatchAstSchema',
  oneOf: [
    {
      type: 'object',
      required: ['op', 'children'],
      properties: {
        op: { enum: ['AND', 'OR', 'NOT'] },
        children: {
          type: 'array',
          minItems: 1,
          maxItems: 20,
          items: { $ref: '#' },
        },
      },
      additionalProperties: false,
    },
    {
      type: 'object',
      required: ['field', 'op'],
      properties: {
        field: { type: 'string', minLength: 1, maxLength: 128 },
        op: {
          enum: [
            'EQ',
            'NEQ',
            'IN',
            'NOT_IN',
            'CONTAINS',
            'GT',
            'LT',
            'GTE',
            'LTE',
            'EXISTS',
            'REGEX',
          ],
        },
        value: {},
      },
      additionalProperties: false,
    },
  ],
};
