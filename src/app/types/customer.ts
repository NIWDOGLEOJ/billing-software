export interface Customer {
  id: string;
  phone: string;
  name: string;
  loyaltyPoints: number;
  totalSpent: number;
  billCount: number;
  createdAt: string;
  lastVisit: string;
}

export interface LoyaltyTransaction {
  customerId: string;
  billId: string;
  pointsEarned: number;
  pointsRedeemed: number;
  date: string;
}
