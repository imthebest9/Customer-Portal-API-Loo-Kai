export const cacheKeys = {
  customer: (id: string) => `customer:${id}`,
  orderStatus: (id: string) => `order:${id}:status`,
};
