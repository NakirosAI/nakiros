import { useCallback, useEffect, useMemo, useState } from 'react';

type FormErrors<T> = Partial<Record<keyof T, string>>;
type FormValidator<T> = (values: T) => FormErrors<T>;

export function useForm<T extends Record<string, unknown>>(
  initialValues: T,
  validate?: FormValidator<T>,
) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<FormErrors<T>>(() => (
    validate ? validate(initialValues) : {}
  ));

  const runValidation = useCallback((nextValues: T) => {
    const nextErrors = validate ? validate(nextValues) : {};
    setErrors(nextErrors);
    return nextErrors;
  }, [validate]);

  useEffect(() => {
    setValues(initialValues);
    runValidation(initialValues);
  }, [initialValues, runValidation]);

  const handleChange = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues((previous) => {
      const next = { ...previous, [key]: value };
      runValidation(next);
      return next;
    });
  }, [runValidation]);

  const reset = useCallback(() => {
    setValues(initialValues);
    runValidation(initialValues);
  }, [initialValues, runValidation]);

  const isValid = useMemo(
    () => Object.values(errors).every((value) => !value),
    [errors],
  );

  return {
    values,
    errors,
    handleChange,
    reset,
    isValid,
  };
}
