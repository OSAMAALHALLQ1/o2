export interface RestaurantBranchDto {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  address?: string;
}

export interface OrderVerificationPayload {
  orderId: string;
  branchSlug: string;
  customerId?: string;
  orderTotal: number;
  currency: string;
  items: Array<{
    menuItemId: string;
    quantity: number;
    category: string;
  }>;
  verifiedAt: Date;
}

export interface IRestaurantIntegration {
  verifyWebhookSignature(headers: Record<string, string>, rawBody: string): boolean;
  parseOrderWebhook(payload: any): OrderVerificationPayload;
  validateReceiptToken(signedToken: string): Promise<OrderVerificationPayload>;
}
