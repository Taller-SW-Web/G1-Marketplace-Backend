// Bound outbound fan-out per operation while preserving the provider/database order.
// After a failed batch, later batches must not be sent.
export async function mapInBatches<T, R>(values: readonly T[], project: (value: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let offset = 0; offset < values.length; offset += 4) {
    results.push(...await Promise.all(values.slice(offset, offset + 4).map(project)));
  }
  return results;
}
