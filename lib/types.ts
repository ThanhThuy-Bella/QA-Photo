export type Role = 'admin' | 'qa';
export type SetStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'archived';
export type PhotoKind = 'label' | 'fold' | 'hangtag' | 'front' | 'defect' | 'carton_face' | 'carton_label';
export type Severity = 'Critical' | 'Major' | 'Minor';

export interface JoColor {
  id: number;
  go_no: string | null;
  cust_style: string;
  jo_no: string;
  lot: string;
  color_code: string;
  order_qty: number | null;
  sew_start: string | null;
  bpo_date: string | null;
  category: 'Men' | 'Ladies';
  in_recap: boolean;
}

export interface PhotoSet {
  id: number;
  jo_no: string;
  color_code: string;
  status: SetStatus;
  reject_reason: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  updated_at: string;
}

export interface Photo {
  id: number;
  set_id: number | null;
  cust_style: string;
  color_code: string;
  kind: PhotoKind;
  path: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  defect_name: string | null;
  severity: Severity | null;
  position: string | null;
  note: string | null;
  created_at: string;
}

export interface DefectType {
  id: number;
  name: string;
  allow_critical: boolean;
  allow_major: boolean;
  allow_minor: boolean;
  sort: number;
  active: boolean;
}

export interface DefectPosition {
  id: number;
  name: string;
  sort: number;
  active: boolean;
}
