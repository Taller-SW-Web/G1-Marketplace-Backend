export interface CheckoutPrincipal {
  sub: string;
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: CheckoutPrincipal;
}
