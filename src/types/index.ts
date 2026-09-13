/**
 * Queen's Palace Eatery & Event Hall - V2 TypeScript Types
 */

// ============================================
// Auth Types
// ============================================
export type UserRole = 'super_admin' | 'admin' | 'cashier' | 'kitchen' | 'customer';

export interface UserPermissions {
  [key: string]: boolean;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phone: string;
  address?: string;
  role: UserRole;
  roleDisplay: string;
  status: string;
  photoURL?: string | null;
  permissions: UserPermissions;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  profile: UserProfile;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupData {
  full_name: string;
  email: string;
  phone?: string;
  password: string;
}

// ============================================
// API Types
// ============================================
export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T;
}

export interface ApiError {
  success: false;
  message: string;
  errors?: Record<string, string>;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
  };
}

// ============================================
// User Types
// ============================================
export interface User {
  id: number;
  full_name: string;
  email: string;
  phone: string | null;
  address: string | null;
  role_id: number;
  role_name: UserRole;
  role_display_name: string;
  status: 'active' | 'restricted' | 'suspended' | 'deleted';
  profile_image: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  permissions?: UserPermissions;
}

export interface CreateStaffData {
  full_name: string;
  email: string;
  phone?: string;
  password: string;
  role: 'admin' | 'cashier' | 'kitchen';
}

export interface Role {
  id: number;
  name: string;
  display_name: string;
}

// ============================================
// Menu Types
// ============================================
export interface Category {
  id: number;
  name: string;
  sort_order: number;
  status: 'active' | 'disabled';
  created_at: string;
}

export interface CreateCategoryData {
  name: string;
  sort_order?: number;
}

export interface UpdateCategoryData {
  name?: string;
  sort_order?: number;
  status?: 'active' | 'disabled';
}

export interface MenuItem {
  id: number;
  name: string;
  description: string | null;
  category_id: number | null;
  category_name?: string;
  category?: string;
  price: number;
  image_path: string | null;
  image?: string;
  quantity_available: number;
  stockQuantity?: number;
  low_stock_threshold?: number;
  status: 'available' | 'out_of_stock' | 'disabled';
  approval_status: 'pending' | 'approved' | 'rejected';
  requires_packaging?: boolean;
  track_inventory?: boolean;
  unit_of_measure?: string;
  isAvailable?: boolean;
  created_by: number | null;
  creator_name?: string;
  approved_by: number | null;
  approver_name?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateMenuItemData {
  name: string;
  description?: string;
  category_id?: number | null;
  price: number;
  quantity_available?: number;
  low_stock_threshold?: number;
  track_inventory?: boolean;
  unit_of_measure?: string;
  requires_packaging?: boolean;
  image_path?: string;
}

export interface UpdateMenuItemData {
  name?: string;
  description?: string;
  category_id?: number | null;
  price?: number;
  quantity_available?: number;
  low_stock_threshold?: number;
  track_inventory?: boolean;
  unit_of_measure?: string;
  status?: 'available' | 'out_of_stock' | 'disabled';
  requires_packaging?: boolean;
  image_path?: string;
}

// ============================================
// Order Types
// ============================================
export type OrderStatus = 'submitted' | 'pending' | 'accepted' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled' | 'rejected';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type PaymentMethod = 'cash' | 'paystack' | 'transfer' | 'pos';
export type OrderType = 'pickup' | 'delivery' | 'walk_in' | 'dine_in';
export type OrderSource = 'customer' | 'cashier' | 'qr_guest' | 'online_customer';

export interface OrderItem {
  id: number;
  order_id: number;
  menu_item_id: number | null;
  item_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  notes?: string | null;
  item_image?: string | null;
  name?: string;
  price?: number;
}

export interface Order {
  id: number;
  order_number: string;
  customer_id: number | null;
  cashier_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  source: OrderSource;
  order_type: OrderType | 'takeaway' | 'dine_in';
  table_id?: number | null;
  table_number?: string | null;
  guest_name?: string | null;
  guest_access_token?: string | null;
  payment_timing?: 'before_meal' | 'after_meal' | null;
  subtotal: number;
  packaging_quantity?: number;
  packaging_unit_price?: number;
  packaging_fee?: number;
  total: number;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
  order_status: OrderStatus;
  delivery_address: string | null;
  notes: string | null;
  accepted_by?: number | null;
  accepted_at?: string | null;
  served_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  items?: OrderItem[];
  transactions?: Transaction[];
  created_at: string;
  updated_at: string;
  // Compatibility fields
  orderId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  total_amount?: number;
  status?: string;
  deliveryType?: string;
  paymentStatus?: string;
  address?: string;
  createdAt?: any;
}

// ============================================
// Restaurant Table & QR Guest Types
// ============================================
export interface RestaurantTable {
  id: number;
  table_number: string;
  qr_code_token: string;
  label?: string | null;
  capacity: number;
  is_active: boolean | number;
  created_at?: string;
  updated_at?: string;
  has_active_orders?: boolean;
  active_orders_count?: number;
  qr_url?: string;
}

export interface GuestTableInfo {
  table_number: string;
  label?: string | null;
  token: string;
  ordering_enabled: boolean;
}

export interface GuestMenuItem {
  id: number;
  name: string;
  description: string;
  price: number;
  category_id: number;
  category_name: string;
  image_url: string | null;
  stock_quantity: number;
  is_available: boolean;
}

export interface GuestMenuResponse {
  table: GuestTableInfo;
  categories: { id: number; name: string }[];
  menu: GuestMenuItem[];
  settings: {
    restaurant_name: string;
    currency: string;
    payment_policy: 'customer_choice' | 'pay_first' | 'pay_after';
  };
}

export interface GuestOrderSubmission {
  table_token: string;
  guest_name: string;
  notes?: string;
  payment_timing: 'before_meal' | 'after_meal';
  payment_method?: 'cash' | 'paystack' | 'transfer' | 'pos';
  items: {
    menu_item_id: number;
    quantity: number;
    notes?: string;
  }[];
  idempotency_token?: string;
}

export interface GuestTrackOrder {
  order_number: string;
  table_number: string;
  guest_name: string;
  order_status: OrderStatus;
  payment_status: PaymentStatus;
  payment_timing: 'before_meal' | 'after_meal';
  subtotal: number;
  packaging_fee: number;
  total: number;
  notes?: string | null;
  items: {
    item_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    notes?: string | null;
  }[];
  created_at: string;
  accepted_at?: string | null;
  served_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  can_cancel?: boolean;
}

export interface CartItem {
  menuItemId: number;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
}

export interface CreateOrderData {
  items: { menu_item_id: number | string; quantity: number; notes?: string }[];
  order_type: OrderType | 'takeaway' | 'dine_in';
  payment_method: PaymentMethod;
  packaging_quantity?: number;
  delivery_address?: string;
  customer_name?: string;
  customer_phone?: string;
  notes?: string;
  source?: OrderSource;
}

export interface PaymentVerificationData {
  reference: string;
  order_id: number;
}

// ============================================
// Transaction Types
// ============================================
export interface Transaction {
  id: number;
  order_id: number;
  transaction_reference: string;
  amount: number;
  payment_method: PaymentMethod;
  payment_status: 'pending' | 'success' | 'failed';
  provider: string;
  verified_at: string | null;
  created_at: string;
  order_number?: string;
  customer_name?: string;
}

// ============================================
// Inventory Types
// ============================================
export interface InventoryItem {
  id: number;
  menu_item_id: number;
  menu_item_name?: string;
  item_name?: string;
  item_image?: string | null;
  item_price?: number;
  item_status?: string;
  category_name?: string | null;
  quantity: number;
  low_stock_threshold: number;
  track_inventory?: boolean;
  unit_of_measure?: string;
  last_updated_by: number | null;
  updated_at: string;
  status?: 'in_stock' | 'low_stock' | 'out_of_stock';
}

export interface StockAdjustmentData {
  quantity: number;
  low_stock_threshold?: number;
  movement_type?: 'stock_in' | 'wastage' | 'damaged' | 'manual_adjust' | 'purchase' | 'waste' | 'sale' | 'adjustment';
  reference_id?: string;
  notes?: string;
}

export interface StockMovement {
  id: number;
  movement_type: 'stock_in' | 'order_deduct' | 'order_restore' | 'wastage' | 'damaged' | 'manual_adjust' | 'initial' | 'add' | 'deduction' | 'adjustment';
  quantity: number;
  quantity_before?: number | null;
  quantity_after?: number | null;
  menu_item_id?: number;
  item_name?: string;
  unit_of_measure?: string;
  reference_id?: string | null;
  notes?: string | null;
  created_by: number | null;
  created_by_name?: string | null;
  created_at: string;
}

export interface InventorySummaryStats {
  total_tracked_items: number;
  low_stock_count: number;
  out_of_stock_count: number;
  movements_today: number;
  total_valuation: number;
}

// ============================================
// Notification Types
// ============================================
export interface Notification {
  id: number | string;
  user_id?: number | string | null;
  role_target?: string | null;
  role?: string[];
  title: string;
  message: string;
  type: 'order' | 'payment' | 'stock' | 'menu' | 'system' | 'event_hall';
  is_read: boolean;
  created_at: string;
  createdAt?: string | Date;
}

// ============================================
// CMS Types
// ============================================
export interface CMSContent {
  id: number;
  section: string;
  key_name: string;
  value: string | null;
  image_path: string | null;
  sort_order: number;
  updated_at: string;
}

// ============================================
// Event Hall Types
// ============================================
export interface EventHallInquiry {
  id: number;
  full_name: string;
  phone: string;
  email: string | null;
  event_type: string;
  preferred_date: string;
  expected_guests: number | null;
  message: string | null;
  status: 'new' | 'contacted' | 'confirmed' | 'declined' | 'completed';
  admin_notes: string | null;
  handled_by: number | null;
  handler_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateEventHallInquiryData {
  full_name: string;
  phone: string;
  email?: string;
  event_type: string;
  preferred_date: string;
  expected_guests?: number;
  message?: string;
}

export interface UpdateEventHallInquiryStatusData {
  status: 'new' | 'contacted' | 'confirmed' | 'declined' | 'completed';
  admin_notes?: string;
}

export interface EventHallStatsData {
  total: number;
  new: number;
  contacted: number;
  confirmed: number;
  declined: number;
  completed: number;
}

// ============================================
// Audit Types
// ============================================
export interface AuditLog {
  id: number;
  user_id: number | null;
  user_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  description: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

// ============================================
// Dashboard & Analytics Types
// ============================================
export interface DashboardOverviewData {
  totalSales: number;
  totalOrders: number;
  totalCustomers: number;
  activeOrders: number;
  todaySales?: number;
  todayOrders?: number;
  lowStockCount?: number;
  pendingMenuCount?: number;
  pending_menu_count?: number;
}

export interface DashboardOverview {
  sales_today: number;
  orders_today: number;
  pending_orders: number;
  low_stock_count: number;
  recent_orders: Order[];
  low_stock_items: InventoryItem[];
}

export interface PackagingReportData {
  summary: {
    total_packs_sold: number;
    total_packaging_revenue: number;
    orders_with_packaging: number;
    avg_packs_per_order: number;
  };
  trend: {
    date: string;
    packs_sold: number;
    packaging_revenue: number;
  }[];
}

export interface SalesReportData {
  period: string;
  start_date: string;
  end_date: string;
  summary: {
    total_sales: number;
    food_sales?: number;
    total_packaging_revenue?: number;
    total_packs_sold?: number;
    order_count: number;
    avg_ticket: number;
    top_category: string;
  };
  packaging?: PackagingReportData;
  sales_trend: {
    date: string;
    total_sales: number;
    order_count: number;
    avg_order_value: number;
  }[];
  payment_methods: {
    payment_method: string;
    total_amount: number;
    tx_count: number;
  }[];
  category_sales: {
    category_id: number;
    category_name: string;
    total_sales: number;
    items_sold: number;
  }[];
  order_sources: {
    source: string;
    order_type: string;
    count: number;
    total_sales: number;
  }[];
}

export interface OrderMetricsData {
  period: string;
  start_date: string;
  end_date: string;
  status_splits: { status: string; count: number }[];
  type_breakdown: { order_type: string; count: number; total_revenue: number }[];
  hourly_volume: { hour: number; order_count: number }[];
}

export interface InventoryReportData {
  summary: {
    total_tracked_items: number;
    total_items_stock: number;
    total_inventory_value: number;
    out_of_stock_count: number;
    low_stock_count: number;
  };
  low_stock_items: {
    menu_item_id: number;
    name: string;
    category_name: string;
    price: number;
    quantity: number;
    low_stock_threshold: number;
    stock_value: number;
  }[];
}

export interface CashierPerformanceData {
  period: string;
  start_date: string;
  end_date: string;
  cashiers: {
    cashier_id: number | null;
    cashier_name: string;
    orders_count: number;
    total_sales: number;
    avg_order_value: number;
    cash_orders: number;
    cash_sales: number;
    pos_orders: number;
    pos_sales: number;
    transfer_orders: number;
    transfer_sales: number;
  }[];
}

// ============================================
// Report Types
// ============================================
export interface ReportFilters {
  period: 'today' | 'week' | 'month' | 'custom';
  start_date?: string;
  end_date?: string;
  type: 'sales' | 'transactions' | 'orders' | 'inventory' | 'customers';
}

export interface ReportSummary {
  total_sales: number;
  total_orders: number;
  average_order: number;
  transactions: Transaction[];
}

// ============================================
// Sidebar Navigation Types
// ============================================
export interface NavItem {
  label: string;
  path: string;
  icon: string;
  permission?: string;
  roles?: UserRole[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}
