import { ValueTransformer } from 'typeorm';

/**
 * Postgres `numeric`/`decimal` columns are returned as strings by the driver.
 * This transformer keeps them as JS numbers on domain objects.
 */
export const numericTransformer: ValueTransformer = {
  to: (value?: number | null): number | null | undefined => value,
  from: (value?: string | null): number | null => (value == null ? null : parseFloat(value)),
};
