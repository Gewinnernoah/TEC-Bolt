// ====== Database row types ======

export type UserRole = 'admin' | 'staff' | 'teacher';
export type DeviceStatus = 'available' | 'borrowed' | 'maintenance' | 'defective' | 'internal_use';
export type TrackingMethod = 'barcode' | 'nfc';
export type LoanStatus = 'active' | 'returned' | 'overdue';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'fulfilled' | 'cancelled';
export type ConditionRating = 'excellent' | 'good' | 'fair' | 'damaged' | 'defective';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'escalated';
export type PrintStatus = 'queued' | 'validating' | 'ready' | 'printing' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type EventStatus = 'planning' | 'preparation' | 'rehearsal' | 'ready' | 'in_progress' | 'completed' | 'cancelled';
export type AuditRisk = 'none' | 'low' | 'medium' | 'high';
export type AuditItemStatus = 'present' | 'missing' | 'unexpected';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  department: string | null;
  phone: string | null;
  avatar_url: string | null;
  fingerprint_enrolled: boolean;
  fingerprint_credential_id: string | null;
  webauthn_credentials: WebAuthnCredential[];
  is_active: boolean;
  exempt_auto_logout: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebAuthnCredential {
  id: string;
  publicKey: string;
  transports?: string[];
  createdAt?: number;
}

export interface InventoryCategory {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  sort_order: number;
  created_at: string;
}

export interface Device {
  id: string;
  inventory_number: string;
  name: string;
  category_id: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  status: DeviceStatus;
  tracking_method: TrackingMethod;
  barcode: string | null;
  nfc_tag_id: string | null;
  qr_code: string | null;
  value: number;
  purchase_date: string | null;
  warranty_until: string | null;
  condition: ConditionRating;
  room_id: string | null;
  cabinet_id: string | null;
  shelf_id: string | null;
  metadata: Record<string, unknown>;
  notes: string | null;
  is_high_value: boolean;
  created_at: string;
  updated_at: string;
  category?: InventoryCategory | null;
  room?: Room | null;
}

export interface Building {
  id: string;
  name: string;
  code: string;
  address: string | null;
  floors: number;
  floor_plan_url: string | null;
  created_at: string;
}

export interface Room {
  id: string;
  building_id: string | null;
  name: string;
  room_number: string;
  floor: number;
  room_type: string;
  capacity: number | null;
  photos: string[];
  installed_technology: string[];
  available_connections: string[];
  connections: string[];
  room_status: string;
  created_at: string;
  building?: Building | null;
}

export interface Cabinet {
  id: string;
  room_id: string | null;
  code: string;
  label: string;
  rows: number;
  columns: number;
  created_at: string;
  room?: Room | null;
}

export interface Shelf {
  id: string;
  cabinet_id: string | null;
  row_index: number;
  col_index: number;
  label: string | null;
  created_at: string;
  cabinet?: Cabinet | null;
}

export interface DeviceBundle {
  id: string;
  name: string;
  description: string | null;
  room_type_hint: string | null;
  is_room_aware: boolean;
  created_at: string;
  items?: DeviceBundleItem[];
}

export interface DeviceBundleItem {
  id: string;
  bundle_id: string;
  device_id: string | null;
  category_id: string | null;
  quantity: number;
  notes: string | null;
  created_at: string;
  device?: Device | null;
  category?: InventoryCategory | null;
}

export interface LendingPeriod {
  id: string;
  name: string;
  duration_minutes: number;
  is_custom: boolean;
  sort_order: number;
  created_at: string;
}

export interface BreakPeriod {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  day_of_week: number;
  is_active: boolean;
  created_at: string;
}

export interface LendingRequest {
  id: string;
  teacher_id: string;
  room_id: string | null;
  period_id: string | null;
  custom_duration_minutes: number | null;
  requested_at: string;
  pickup_at: string | null;
  return_at: string | null;
  status: RequestStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  teacher?: Profile | null;
  room?: Room | null;
  period?: LendingPeriod | null;
  items?: LendingRequestItem[];
}

export interface LendingRequestItem {
  id: string;
  request_id: string;
  device_id: string | null;
  bundle_id: string | null;
  category_id: string | null;
  quantity: number;
  notes: string | null;
  created_at: string;
  device?: Device | null;
  bundle?: DeviceBundle | null;
  category?: InventoryCategory | null;
}

export interface LendingLoan {
  id: string;
  request_id: string | null;
  teacher_id: string;
  staff_id: string;
  room_id: string | null;
  period_id: string | null;
  checkout_at: string;
  expected_return_at: string;
  actual_return_at: string | null;
  status: LoanStatus;
  signature_data: string | null;
  signature_name: string | null;
  return_condition: ConditionRating | null;
  return_notes: string | null;
  return_staff_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  teacher?: Profile | null;
  staff?: Profile | null;
  room?: Room | null;
  period?: LendingPeriod | null;
  items?: LendingLoanItem[];
}

export interface LendingLoanItem {
  id: string;
  loan_id: string;
  device_id: string;
  created_at: string;
  device?: Device | null;
}

export interface Consumable {
  id: string;
  name: string;
  type: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  reorder_qty: number;
  reorder_link: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FilamentCatalogEntry {
  id: string;
  material: string;
  color: string;
  color_hex: string;
  is_available: boolean;
  sort_order: number;
  created_at: string;
}

export interface FilamentInventory {
  id: string;
  catalog_id: string;
  remaining_grams: number;
  total_grams: number;
  spool_count: number;
  min_grams: number;
  updated_at: string;
  catalog?: FilamentCatalogEntry | null;
}

export interface Printer {
  id: string;
  name: string;
  model: string | null;
  status: string;
  current_job_id: string | null;
  ip_address: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PrintRequest {
  id: string;
  teacher_id: string;
  file_name: string;
  file_url: string | null;
  file_size_bytes: number | null;
  file_format: string | null;
  file_valid: boolean;
  validation_notes: string | null;
  filament_catalog_id: string | null;
  filament_material: string | null;
  filament_color: string | null;
  estimated_grams: number | null;
  estimated_minutes: number | null;
  copies: number;
  notes: string | null;
  status: PrintStatus;
  assigned_printer_id: string | null;
  queue_position: number | null;
  current_layer: number;
  total_layers: number;
  progress_pct: number;
  estimated_finish_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  failed_reason: string | null;
  created_at: string;
  updated_at: string;
  teacher?: Profile | null;
  assigned_printer?: Printer | null;
  filament?: FilamentCatalogEntry | null;
}

export interface TicketCategory {
  id: string;
  key: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  requires_room: boolean;
  requires_speedtest: boolean;
  is_enabled: boolean;
  sort_order: number;
  created_at: string;
}

export interface Ticket {
  id: string;
  ticket_number: string;
  category_id: string;
  category_key: string;
  title: string;
  description: string | null;
  room_id: string | null;
  created_by: string;
  assigned_to: string | null;
  priority: TicketPriority;
  status: TicketStatus;
  photos: string[];
  speedtest_result: SpeedtestResult | null;
  ping_result: PingResult | null;
  escalated: boolean;
  escalated_at: string | null;
  escalated_by: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
  category?: TicketCategory | null;
  room?: Room | null;
  creator?: Profile | null;
  assignee?: Profile | null;
  comments?: TicketComment[];
}

export interface SpeedtestResult {
  download_mbps: number;
  upload_mbps: number;
  ping_ms: number;
  jitter_ms: number;
  packet_loss_pct: number;
  timestamp: string;
}

export interface PingResult {
  min_ms: number;
  avg_ms: number;
  max_ms: number;
  packets_sent: number;
  packets_lost: number;
  timestamp: string;
}

export interface TicketComment {
  id: string;
  ticket_id: string;
  author_id: string;
  comment: string;
  is_internal: boolean;
  created_at: string;
  author?: Profile | null;
}

export interface WifiMeasurement {
  id: string;
  room_id: string;
  measured_by: string | null;
  signal_strength_dbm: number;
  download_mbps: number;
  upload_mbps: number;
  ping_ms: number;
  jitter_ms: number;
  packet_loss_pct: number;
  is_outage: boolean;
  notes: string | null;
  created_at: string;
  room?: Room | null;
}

export interface Faq {
  id: string;
  title: string;
  category: string;
  content: string;
  device_category_id: string | null;
  device_id: string | null;
  tags: string[];
  video_url: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface SchoolEvent {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  room_id: string | null;
  organizer_id: string;
  start_at: string;
  end_at: string;
  status: EventStatus;
  stage_plan: Record<string, unknown>;
  equipment_plan: EventEquipmentItem[];
  rehearsal_schedule: RehearsalSlot[];
  notes: string | null;
  created_at: string;
  updated_at: string;
  room?: Room | null;
  organizer?: Profile | null;
  tasks?: EventTask[];
}

export interface EventEquipmentItem {
  id: string;
  name: string;
  qty: number;
  assigned_to?: string;
  status: 'needed' | 'ready' | 'set' | 'done';
}

export interface RehearsalSlot {
  id: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  notes?: string;
}

export interface EventTask {
  id: string;
  event_id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  due_at: string | null;
  is_completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  sort_order: number;
  created_at: string;
  assignee?: Profile | null;
}

export interface DamageReport {
  id: string;
  device_id: string;
  reported_by: string;
  inventory_number: string | null;
  serial_number: string | null;
  description: string;
  photos: string[];
  severity: string;
  created_at: string;
  device?: Device | null;
  reporter?: Profile | null;
}

export interface RepairRecord {
  id: string;
  device_id: string;
  damage_report_id: string | null;
  reported_by: string;
  issue_description: string;
  repair_status: string;
  intake_form_data: Record<string, unknown>;
  resolved_at: string | null;
  resolution: string | null;
  cost: number;
  is_recurring: boolean;
  created_at: string;
  updated_at: string;
  device?: Device | null;
}

export interface InventoryAudit {
  id: string;
  name: string;
  started_by: string;
  status: string;
  expected_count: number;
  actual_count: number;
  missing_count: number;
  unexpected_count: number;
  risk_level: AuditRisk;
  risk_notes: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  items?: InventoryAuditItem[];
}

export interface InventoryAuditItem {
  id: string;
  audit_id: string;
  device_id: string | null;
  inventory_number: string | null;
  expected_status: DeviceStatus | null;
  actual_status: DeviceStatus | null;
  item_status: AuditItemStatus;
  scanned_at: string | null;
  scanned_by: string | null;
  notes: string | null;
  created_at: string;
  device?: Device | null;
}

export interface ActivityLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
  user?: Profile | null;
}

export interface DeviceNote {
  id: string;
  device_id: string;
  author_id: string;
  note: string;
  is_internal: boolean;
  created_at: string;
  author?: Profile | null;
}

export interface SystemSetting {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface AppNotification {
  id: string;
  user_id: string | null;
  type: string;
  title: string;
  message: string;
  priority: string;
  is_read: boolean;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
}
