import { useCallback, useEffect, useMemo, useState } from 'react';

type FormErrors<T> = Partial<Record<keyof T, string>>;
type FormValidator<T> = (values: T) => FormErrors<T>;

/**
 * Lightweight controlled-form helper. Holds `values`, derives `errors` from an
 * optional sync `validate` callback on every change, and re-syncs to
 * `initialValues` whenever the reference changes (so parents can reset the
 * form by passing fresh defaults).
 *
 * @returns `{ values, errors, handleChange, reset, isValid }` — `handleChange`
 *   is generic on the field key, `isValid` is `true` when no error is set.
 */
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
