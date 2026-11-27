const { z } = require('zod');

/**
 * Centralized Zod schema validation middleware for body, query, and params.
 */
function validate(schemas) {
  return (req, res, next) => {
    const errors = [];

    for (const target of ['params', 'query', 'body']) {
      const schema = schemas[target];
      if (!schema) continue;
      const result = schema.safeParse(req[target]);
      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push({
            location: target,
            field: issue.path.join('.') || target,
            message: issue.message,
          });
        }
      } else {
        req[target] = result.data;
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: errors[0].message || 'Validasi input gagal',
        errors,
        requestId: req.requestId,
      });
    }

    return next();
  };
}

const createTransactionSchema = z.object({
  type: z.enum(['pemasukan', 'pengeluaran'], {
    error: 'Field "type" wajib diisi dengan nilai "pemasukan" atau "pengeluaran"',
  }),
  amount: z.coerce
    .number({ error: 'Field "amount" wajib berupa angka lebih dari 0' })
    .refine((n) => Number.isFinite(n) && n > 0, {
      message: 'Field "amount" wajib berupa angka lebih dari 0',
    }),
  category: z.string().trim().max(60).optional(),
  note: z.string().trim().max(300).optional(),
  date: z.union([z.string(), z.null()]).optional(),
});

const updateTransactionSchema = z
  .object({
    type: z.enum(['pemasukan', 'pengeluaran'], {
      error: 'Field "type" harus bernilai "pemasukan" atau "pengeluaran"',
    }).optional(),
    category: z.string().trim().min(1, 'Field "category" tidak boleh kosong').max(60).optional(),
    amount: z.coerce
      .number({ error: 'Field "amount" harus berupa angka lebih dari 0' })
      .refine((n) => Number.isFinite(n) && n > 0, {
        message: 'Field "amount" harus berupa angka lebih dari 0',
      })
      .optional(),
    note: z.string().trim().min(1, 'Field "note" tidak boleh kosong').max(300).optional(),
    date: z.string().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Minimal satu field harus dikirim untuk memperbarui transaksi',
  });

module.exports = {
  validate,
  createTransactionSchema,
  updateTransactionSchema,
};
