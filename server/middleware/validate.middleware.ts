import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export interface FormattedZodError {
  field: string;
  message: string;
  code: string;
}

/**
 * Utilidad genérica validateBody(schema) que evalúa req.body antes de ingresar a los controladores.
 * Si la validación falla, devuelve status 400 con un desglose estructurado de campos inválidos.
 * Si es exitosa, reemplaza req.body con los datos parseados y transformados.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const error = result.error as ZodError;
      const details: FormattedZodError[] = error.errors.map(err => ({
        field: err.path.join('.') || 'body',
        message: err.message,
        code: err.code
      }));

      res.status(400).json({
        error: 'Validation Error: Invalid request body structure',
        details
      });
      return;
    }

    req.body = result.data;
    next();
  };
}
