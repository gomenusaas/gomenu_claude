
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "ai_credit_ledger": {
                  Row: {
                    "created_at": string,"created_by": string | null,"delta": number,"id": string,"invoice_id": string | null,"job_id": string | null,"note": string | null,"reason": Database["public"]['Enums']["ai_credit_reason"],"restaurant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"delta": number,"id"?: string,"invoice_id"?: string | null,"job_id"?: string | null,"note"?: string | null,"reason": Database["public"]['Enums']["ai_credit_reason"],"restaurant_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"delta"?: number,"id"?: string,"invoice_id"?: string | null,"job_id"?: string | null,"note"?: string | null,"reason"?: Database["public"]['Enums']["ai_credit_reason"],"restaurant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_credit_ledger_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "billing_invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_credit_ledger_job_fk"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "ai_jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_credit_ledger_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_jobs": {
                  Row: {
                    "completed_at": string | null,"created_at": string,"created_by": string | null,"credits_charged": number,"error": string | null,"id": string,"item_count": number,"kind": Database["public"]['Enums']["ai_job_kind"],"restaurant_id": string,"result": Json | null,"scope": NonNullable<Json>,"source_locale": string | null,"source_path": string | null,"status": Database["public"]['Enums']["ai_job_status"],"target_locale": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"credits_charged"?: number,"error"?: string | null,"id"?: string,"item_count"?: number,"kind": Database["public"]['Enums']["ai_job_kind"],"restaurant_id": string,"result"?: Json | null,"scope"?: NonNullable<Json>,"source_locale"?: string | null,"source_path"?: string | null,"status"?: Database["public"]['Enums']["ai_job_status"],"target_locale"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"credits_charged"?: number,"error"?: string | null,"id"?: string,"item_count"?: number,"kind"?: Database["public"]['Enums']["ai_job_kind"],"restaurant_id"?: string,"result"?: Json | null,"scope"?: NonNullable<Json>,"source_locale"?: string | null,"source_path"?: string | null,"status"?: Database["public"]['Enums']["ai_job_status"],"target_locale"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_jobs_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"analytics_events": {
                  Row: {
                    "branch_id": string | null,"created_at": string,"entity_id": string | null,"event_type": Database["public"]['Enums']["analytics_event_type"],"id": number,"is_internal": boolean,"locale": string | null,"qr_code_id": string | null,"restaurant_id": string,"session_id": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"event_type": Database["public"]['Enums']["analytics_event_type"],"id"?: number,"is_internal"?: boolean,"locale"?: string | null,"qr_code_id"?: string | null,"restaurant_id": string,"session_id"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "branch_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"event_type"?: Database["public"]['Enums']["analytics_event_type"],"id"?: number,"is_internal"?: boolean,"locale"?: string | null,"qr_code_id"?: string | null,"restaurant_id"?: string,"session_id"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "analytics_events_qr_code_id_fkey"
      columns: ["qr_code_id"]
isOneToOne: false
      referencedRelation: "qr_codes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "analytics_events_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_events": {
                  Row: {
                    "action": string,"actor_email": string | null,"actor_membership_id": string | null,"actor_name": string | null,"actor_phone_e164": string | null,"actor_role_key": string | null,"actor_user_id": string | null,"after": Json | null,"before": Json | null,"branch_id": string | null,"device_id": string | null,"id": string,"ip_address": string | null,"metadata": NonNullable<Json>,"object_id": string | null,"object_type": string,"occurred_at": string,"restaurant_id": string | null,"user_agent": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_email"?: string | null,"actor_membership_id"?: string | null,"actor_name"?: string | null,"actor_phone_e164"?: string | null,"actor_role_key"?: string | null,"actor_user_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"branch_id"?: string | null,"device_id"?: string | null,"id"?: string,"ip_address"?: string | null,"metadata"?: NonNullable<Json>,"object_id"?: string | null,"object_type": string,"occurred_at"?: string,"restaurant_id"?: string | null,"user_agent"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_email"?: string | null,"actor_membership_id"?: string | null,"actor_name"?: string | null,"actor_phone_e164"?: string | null,"actor_role_key"?: string | null,"actor_user_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"branch_id"?: string | null,"device_id"?: string | null,"id"?: string,"ip_address"?: string | null,"metadata"?: NonNullable<Json>,"object_id"?: string | null,"object_type"?: string,"occurred_at"?: string,"restaurant_id"?: string | null,"user_agent"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"billing_invoices": {
                  Row: {
                    "ai_credits": number | null,"branch_unit_amount_minor": number,"created_at": string,"created_by": string | null,"currency": string,"due_at": string,"extra_branches": number,"id": string,"issued_at": string,"kind": Database["public"]['Enums']["invoice_kind"],"lines": NonNullable<Json>,"number": string,"paid_at": string | null,"plan_amount_minor": number,"plan_id": string | null,"restaurant_id": string,"status": Database["public"]['Enums']["invoice_status"],"subtotal_minor": number,"tax_label": string,"tax_minor": number,"tax_rate_bp": number,"total_minor": number,"updated_at": string,"void_reason": string | null,"voided_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_credits"?: number | null,"branch_unit_amount_minor": number,"created_at"?: string,"created_by"?: string | null,"currency": string,"due_at": string,"extra_branches"?: number,"id"?: string,"issued_at"?: string,"kind": Database["public"]['Enums']["invoice_kind"],"lines": NonNullable<Json>,"number": string,"paid_at"?: string | null,"plan_amount_minor": number,"plan_id"?: string | null,"restaurant_id": string,"status"?: Database["public"]['Enums']["invoice_status"],"subtotal_minor": number,"tax_label": string,"tax_minor": number,"tax_rate_bp": number,"total_minor": number,"updated_at"?: string,"void_reason"?: string | null,"voided_at"?: string | null
                  }
                  Update: {
                    "ai_credits"?: number | null,"branch_unit_amount_minor"?: number,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"due_at"?: string,"extra_branches"?: number,"id"?: string,"issued_at"?: string,"kind"?: Database["public"]['Enums']["invoice_kind"],"lines"?: NonNullable<Json>,"number"?: string,"paid_at"?: string | null,"plan_amount_minor"?: number,"plan_id"?: string | null,"restaurant_id"?: string,"status"?: Database["public"]['Enums']["invoice_status"],"subtotal_minor"?: number,"tax_label"?: string,"tax_minor"?: number,"tax_rate_bp"?: number,"total_minor"?: number,"updated_at"?: string,"void_reason"?: string | null,"voided_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "billing_invoices_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "billing_invoices_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"billing_payments": {
                  Row: {
                    "amount_minor": number,"created_at": string,"currency": string,"id": string,"invoice_id": string,"method": Database["public"]['Enums']["payment_method"],"processor": string | null,"processor_payment_id": string | null,"received_at": string,"recorded_by": string | null,"reference": string,"restaurant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"created_at"?: string,"currency": string,"id"?: string,"invoice_id": string,"method": Database["public"]['Enums']["payment_method"],"processor"?: string | null,"processor_payment_id"?: string | null,"received_at": string,"recorded_by"?: string | null,"reference": string,"restaurant_id": string
                  }
                  Update: {
                    "amount_minor"?: number,"created_at"?: string,"currency"?: string,"id"?: string,"invoice_id"?: string,"method"?: Database["public"]['Enums']["payment_method"],"processor"?: string | null,"processor_payment_id"?: string | null,"received_at"?: string,"recorded_by"?: string | null,"reference"?: string,"restaurant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "billing_payments_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "billing_invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "billing_payments_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"billing_prices": {
                  Row: {
                    "active_from": string,"active_until": string | null,"amount_minor": number,"billing_interval": string,"created_at": string,"created_by": string | null,"currency": string,"id": string,"item_type": Database["public"]['Enums']["price_item"],"plan_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active_from"?: string,"active_until"?: string | null,"amount_minor": number,"billing_interval"?: string,"created_at"?: string,"created_by"?: string | null,"currency": string,"id"?: string,"item_type": Database["public"]['Enums']["price_item"],"plan_id"?: string | null
                  }
                  Update: {
                    "active_from"?: string,"active_until"?: string | null,"amount_minor"?: number,"billing_interval"?: string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"id"?: string,"item_type"?: Database["public"]['Enums']["price_item"],"plan_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "billing_prices_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["id"]
    }
                  ]
                },"branch_hours": {
                  Row: {
                    "branch_id": string,"closes_at": string,"day_of_week": number,"id": string,"opens_at": string,"restaurant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"closes_at": string,"day_of_week": number,"id"?: string,"opens_at": string,"restaurant_id": string
                  }
                  Update: {
                    "branch_id"?: string,"closes_at"?: string,"day_of_week"?: number,"id"?: string,"opens_at"?: string,"restaurant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "branch_hours_branch_id_restaurant_id_fkey"
      columns: ["branch_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id","restaurant_id"]
    }
                  ]
                },"branch_menu_overrides": {
                  Row: {
                    "branch_id": string,"category_id": string | null,"id": string,"is_available": boolean,"is_hidden": boolean,"item_id": string | null,"restaurant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"category_id"?: string | null,"id"?: string,"is_available"?: boolean,"is_hidden"?: boolean,"item_id"?: string | null,"restaurant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "branch_id"?: string,"category_id"?: string | null,"id"?: string,"is_available"?: boolean,"is_hidden"?: boolean,"item_id"?: string | null,"restaurant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "branch_menu_overrides_branch_id_restaurant_id_fkey"
      columns: ["branch_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id","restaurant_id"]
    },{
      foreignKeyName: "branch_menu_overrides_category_id_restaurant_id_fkey"
      columns: ["category_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "menu_categories"
      referencedColumns: ["id","restaurant_id"]
    },{
      foreignKeyName: "branch_menu_overrides_item_id_restaurant_id_fkey"
      columns: ["item_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "menu_items"
      referencedColumns: ["id","restaurant_id"]
    }
                  ]
                },"branches": {
                  Row: {
                    "address": string | null,"archived_at": string | null,"created_at": string,"id": string,"is_active": boolean,"latitude": number | null,"longitude": number | null,"maps_url": string | null,"name": string,"override_until": string | null,"phone_e164": string | null,"restaurant_id": string,"sort": number,"status_override": Database["public"]['Enums']["branch_status_override"],"updated_at": string,"whatsapp_e164": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"archived_at"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"latitude"?: number | null,"longitude"?: number | null,"maps_url"?: string | null,"name": string,"override_until"?: string | null,"phone_e164"?: string | null,"restaurant_id": string,"sort"?: number,"status_override"?: Database["public"]['Enums']["branch_status_override"],"updated_at"?: string,"whatsapp_e164"?: string | null
                  }
                  Update: {
                    "address"?: string | null,"archived_at"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"latitude"?: number | null,"longitude"?: number | null,"maps_url"?: string | null,"name"?: string,"override_until"?: string | null,"phone_e164"?: string | null,"restaurant_id"?: string,"sort"?: number,"status_override"?: Database["public"]['Enums']["branch_status_override"],"updated_at"?: string,"whatsapp_e164"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "branches_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"diner_favorites": {
                  Row: {
                    "created_at": string,"id": string,"item_id": string | null,"restaurant_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"item_id"?: string | null,"restaurant_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"item_id"?: string | null,"restaurant_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "diner_favorites_item_id_restaurant_id_fkey"
      columns: ["item_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "menu_items"
      referencedColumns: ["id","restaurant_id"]
    },{
      foreignKeyName: "diner_favorites_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"features": {
                  Row: {
                    "category": string,"description": string | null,"key": string,"kind": Database["public"]['Enums']["feature_kind"],"name": string,"sort": number
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"description"?: string | null,"key": string,"kind"?: Database["public"]['Enums']["feature_kind"],"name": string,"sort"?: number
                  }
                  Update: {
                    "category"?: string,"description"?: string | null,"key"?: string,"kind"?: Database["public"]['Enums']["feature_kind"],"name"?: string,"sort"?: number
                  }
                  Relationships: [
                    
                  ]
                },"frame_branches": {
                  Row: {
                    "branch_id": string,"frame_id": string,"restaurant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"frame_id": string,"restaurant_id": string
                  }
                  Update: {
                    "branch_id"?: string,"frame_id"?: string,"restaurant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "frame_branches_branch_id_restaurant_id_fkey"
      columns: ["branch_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id","restaurant_id"]
    },{
      foreignKeyName: "frame_branches_frame_id_restaurant_id_fkey"
      columns: ["frame_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "frames"
      referencedColumns: ["id","restaurant_id"]
    }
                  ]
                },"frames": {
                  Row: {
                    "archived_at": string | null,"caption": NonNullable<Json>,"created_at": string,"created_by": string | null,"expires_at": string,"i18n_meta": NonNullable<Json>,"id": string,"item_id": string | null,"kind": Database["public"]['Enums']["media_kind"],"media_path": string,"poster_path": string | null,"promotion_id": string | null,"published_at": string,"restaurant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"caption"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"expires_at": string,"i18n_meta"?: NonNullable<Json>,"id"?: string,"item_id"?: string | null,"kind": Database["public"]['Enums']["media_kind"],"media_path": string,"poster_path"?: string | null,"promotion_id"?: string | null,"published_at"?: string,"restaurant_id": string
                  }
                  Update: {
                    "archived_at"?: string | null,"caption"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string,"i18n_meta"?: NonNullable<Json>,"id"?: string,"item_id"?: string | null,"kind"?: Database["public"]['Enums']["media_kind"],"media_path"?: string,"poster_path"?: string | null,"promotion_id"?: string | null,"published_at"?: string,"restaurant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "frames_item_id_restaurant_id_fkey"
      columns: ["item_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "menu_items"
      referencedColumns: ["id","restaurant_id"]
    },{
      foreignKeyName: "frames_promotion_id_restaurant_id_fkey"
      columns: ["promotion_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "promotions"
      referencedColumns: ["id","restaurant_id"]
    },{
      foreignKeyName: "frames_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"gallery_media": {
                  Row: {
                    "bytes": number | null,"caption": NonNullable<Json>,"created_at": string,"created_by": string | null,"height": number | null,"id": string,"is_active": boolean,"kind": Database["public"]['Enums']["media_kind"],"poster_path": string | null,"restaurant_id": string,"sort": number,"storage_path": string,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bytes"?: number | null,"caption"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"height"?: number | null,"id"?: string,"is_active"?: boolean,"kind": Database["public"]['Enums']["media_kind"],"poster_path"?: string | null,"restaurant_id": string,"sort"?: number,"storage_path": string,"width"?: number | null
                  }
                  Update: {
                    "bytes"?: number | null,"caption"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"height"?: number | null,"id"?: string,"is_active"?: boolean,"kind"?: Database["public"]['Enums']["media_kind"],"poster_path"?: string | null,"restaurant_id"?: string,"sort"?: number,"storage_path"?: string,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "gallery_media_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"membership_branches": {
                  Row: {
                    "branch_id": string,"created_at": string,"membership_id": string,"restaurant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"created_at"?: string,"membership_id": string,"restaurant_id": string
                  }
                  Update: {
                    "branch_id"?: string,"created_at"?: string,"membership_id"?: string,"restaurant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "membership_branches_branch_id_restaurant_id_fkey"
      columns: ["branch_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id","restaurant_id"]
    },{
      foreignKeyName: "membership_branches_membership_id_restaurant_id_fkey"
      columns: ["membership_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id","restaurant_id"]
    }
                  ]
                },"membership_permission_overrides": {
                  Row: {
                    "created_at": string,"created_by": string | null,"effect": Database["public"]['Enums']["permission_effect"],"membership_id": string,"permission_key": string,"restaurant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"effect": Database["public"]['Enums']["permission_effect"],"membership_id": string,"permission_key": string,"restaurant_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"effect"?: Database["public"]['Enums']["permission_effect"],"membership_id"?: string,"permission_key"?: string,"restaurant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "membership_permission_override_membership_id_restaurant_id_fkey"
      columns: ["membership_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id","restaurant_id"]
    },{
      foreignKeyName: "membership_permission_overrides_permission_key_fkey"
      columns: ["permission_key"]
isOneToOne: false
      referencedRelation: "permissions"
      referencedColumns: ["key"]
    }
                  ]
                },"memberships": {
                  Row: {
                    "activated_at": string | null,"branch_scope": Database["public"]['Enums']["branch_scope"],"created_at": string,"id": string,"intended_branch_id": string | null,"invited_by": string | null,"invited_name": string | null,"invited_phone_e164": string | null,"restaurant_id": string,"role_id": string,"status": Database["public"]['Enums']["membership_status"],"updated_at": string,"user_id": string | null,"verified_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "activated_at"?: string | null,"branch_scope"?: Database["public"]['Enums']["branch_scope"],"created_at"?: string,"id"?: string,"intended_branch_id"?: string | null,"invited_by"?: string | null,"invited_name"?: string | null,"invited_phone_e164"?: string | null,"restaurant_id": string,"role_id": string,"status": Database["public"]['Enums']["membership_status"],"updated_at"?: string,"user_id"?: string | null,"verified_at"?: string | null
                  }
                  Update: {
                    "activated_at"?: string | null,"branch_scope"?: Database["public"]['Enums']["branch_scope"],"created_at"?: string,"id"?: string,"intended_branch_id"?: string | null,"invited_by"?: string | null,"invited_name"?: string | null,"invited_phone_e164"?: string | null,"restaurant_id"?: string,"role_id"?: string,"status"?: Database["public"]['Enums']["membership_status"],"updated_at"?: string,"user_id"?: string | null,"verified_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_intended_branch_id_restaurant_id_fkey"
      columns: ["intended_branch_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id","restaurant_id"]
    },{
      foreignKeyName: "memberships_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                },"menu_categories": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"created_by": string | null,"description": NonNullable<Json>,"i18n_meta": NonNullable<Json>,"id": string,"is_active": boolean,"name": NonNullable<Json>,"restaurant_id": string,"sort": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: NonNullable<Json>,"i18n_meta"?: NonNullable<Json>,"id"?: string,"is_active"?: boolean,"name": NonNullable<Json>,"restaurant_id": string,"sort"?: number,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: NonNullable<Json>,"i18n_meta"?: NonNullable<Json>,"id"?: string,"is_active"?: boolean,"name"?: NonNullable<Json>,"restaurant_id"?: string,"sort"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_categories_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"menu_item_media": {
                  Row: {
                    "bytes": number | null,"created_at": string,"created_by": string | null,"height": number | null,"id": string,"is_cover": boolean,"item_id": string,"kind": Database["public"]['Enums']["media_kind"],"poster_path": string | null,"restaurant_id": string,"sort": number,"storage_path": string,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bytes"?: number | null,"created_at"?: string,"created_by"?: string | null,"height"?: number | null,"id"?: string,"is_cover"?: boolean,"item_id": string,"kind": Database["public"]['Enums']["media_kind"],"poster_path"?: string | null,"restaurant_id": string,"sort"?: number,"storage_path": string,"width"?: number | null
                  }
                  Update: {
                    "bytes"?: number | null,"created_at"?: string,"created_by"?: string | null,"height"?: number | null,"id"?: string,"is_cover"?: boolean,"item_id"?: string,"kind"?: Database["public"]['Enums']["media_kind"],"poster_path"?: string | null,"restaurant_id"?: string,"sort"?: number,"storage_path"?: string,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_item_media_item_id_restaurant_id_fkey"
      columns: ["item_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "menu_items"
      referencedColumns: ["id","restaurant_id"]
    }
                  ]
                },"menu_item_variants": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"i18n_meta": NonNullable<Json>,"id": string,"is_default": boolean,"item_id": string,"name": NonNullable<Json>,"price_minor": number,"restaurant_id": string,"sort": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"i18n_meta"?: NonNullable<Json>,"id"?: string,"is_default"?: boolean,"item_id": string,"name": NonNullable<Json>,"price_minor": number,"restaurant_id": string,"sort"?: number,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"i18n_meta"?: NonNullable<Json>,"id"?: string,"is_default"?: boolean,"item_id"?: string,"name"?: NonNullable<Json>,"price_minor"?: number,"restaurant_id"?: string,"sort"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_item_variants_item_id_restaurant_id_fkey"
      columns: ["item_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "menu_items"
      referencedColumns: ["id","restaurant_id"]
    }
                  ]
                },"menu_items": {
                  Row: {
                    "allergens": (Database["public"]['Enums']["allergen"])[],"archived_at": string | null,"calories": number | null,"category_id": string,"created_at": string,"created_by": string | null,"description": NonNullable<Json>,"dietary_tags": (Database["public"]['Enums']["dietary_tag"])[],"i18n_meta": NonNullable<Json>,"id": string,"is_active": boolean,"is_available": boolean,"name": NonNullable<Json>,"price_minor": number,"restaurant_id": string,"sort": number,"spice_level": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allergens"?: (Database["public"]['Enums']["allergen"])[],"archived_at"?: string | null,"calories"?: number | null,"category_id": string,"created_at"?: string,"created_by"?: string | null,"description"?: NonNullable<Json>,"dietary_tags"?: (Database["public"]['Enums']["dietary_tag"])[],"i18n_meta"?: NonNullable<Json>,"id"?: string,"is_active"?: boolean,"is_available"?: boolean,"name": NonNullable<Json>,"price_minor": number,"restaurant_id": string,"sort"?: number,"spice_level"?: number,"updated_at"?: string
                  }
                  Update: {
                    "allergens"?: (Database["public"]['Enums']["allergen"])[],"archived_at"?: string | null,"calories"?: number | null,"category_id"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: NonNullable<Json>,"dietary_tags"?: (Database["public"]['Enums']["dietary_tag"])[],"i18n_meta"?: NonNullable<Json>,"id"?: string,"is_active"?: boolean,"is_available"?: boolean,"name"?: NonNullable<Json>,"price_minor"?: number,"restaurant_id"?: string,"sort"?: number,"spice_level"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_items_category_id_restaurant_id_fkey"
      columns: ["category_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "menu_categories"
      referencedColumns: ["id","restaurant_id"]
    },{
      foreignKeyName: "menu_items_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"menu_option_groups": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"i18n_meta": NonNullable<Json>,"id": string,"item_id": string,"max_select": number | null,"min_select": number,"name": NonNullable<Json>,"restaurant_id": string,"sort": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"i18n_meta"?: NonNullable<Json>,"id"?: string,"item_id": string,"max_select"?: number | null,"min_select"?: number,"name": NonNullable<Json>,"restaurant_id": string,"sort"?: number,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"i18n_meta"?: NonNullable<Json>,"id"?: string,"item_id"?: string,"max_select"?: number | null,"min_select"?: number,"name"?: NonNullable<Json>,"restaurant_id"?: string,"sort"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_option_groups_item_id_restaurant_id_fkey"
      columns: ["item_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "menu_items"
      referencedColumns: ["id","restaurant_id"]
    }
                  ]
                },"menu_options": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"group_id": string,"i18n_meta": NonNullable<Json>,"id": string,"is_available": boolean,"name": NonNullable<Json>,"price_delta_minor": number,"restaurant_id": string,"sort": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"group_id": string,"i18n_meta"?: NonNullable<Json>,"id"?: string,"is_available"?: boolean,"name": NonNullable<Json>,"price_delta_minor"?: number,"restaurant_id": string,"sort"?: number,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"group_id"?: string,"i18n_meta"?: NonNullable<Json>,"id"?: string,"is_available"?: boolean,"name"?: NonNullable<Json>,"price_delta_minor"?: number,"restaurant_id"?: string,"sort"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_options_group_id_restaurant_id_fkey"
      columns: ["group_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "menu_option_groups"
      referencedColumns: ["id","restaurant_id"]
    }
                  ]
                },"permissions": {
                  Row: {
                    "category": string,"description": string,"key": string,"owner_only": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"description": string,"key": string,"owner_only"?: boolean
                  }
                  Update: {
                    "category"?: string,"description"?: string,"key"?: string,"owner_only"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"plan_entitlements": {
                  Row: {
                    "enabled": boolean,"feature_key": string,"limit_value": number | null,"plan_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "enabled": boolean,"feature_key": string,"limit_value"?: number | null,"plan_id": string
                  }
                  Update: {
                    "enabled"?: boolean,"feature_key"?: string,"limit_value"?: number | null,"plan_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "plan_entitlements_feature_key_fkey"
      columns: ["feature_key"]
isOneToOne: false
      referencedRelation: "features"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "plan_entitlements_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["id"]
    }
                  ]
                },"plans": {
                  Row: {
                    "created_at": string,"description": string | null,"id": string,"is_active": boolean,"is_public": boolean,"key": string,"name": string,"sort": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"is_public"?: boolean,"key": string,"name": string,"sort"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"is_public"?: boolean,"key"?: string,"name"?: string,"sort"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"platform_audit_events": {
                  Row: {
                    "action": string,"actor_email": string | null,"actor_name": string | null,"actor_phone_e164": string | null,"actor_platform_role": string | null,"actor_user_id": string | null,"after": Json | null,"before": Json | null,"id": string,"ip_address": string | null,"metadata": NonNullable<Json>,"object_id": string | null,"object_type": string,"occurred_at": string,"reason": string | null,"restaurant_id": string | null,"user_agent": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_email"?: string | null,"actor_name"?: string | null,"actor_phone_e164"?: string | null,"actor_platform_role"?: string | null,"actor_user_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"id"?: string,"ip_address"?: string | null,"metadata"?: NonNullable<Json>,"object_id"?: string | null,"object_type": string,"occurred_at"?: string,"reason"?: string | null,"restaurant_id"?: string | null,"user_agent"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_email"?: string | null,"actor_name"?: string | null,"actor_phone_e164"?: string | null,"actor_platform_role"?: string | null,"actor_user_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"id"?: string,"ip_address"?: string | null,"metadata"?: NonNullable<Json>,"object_id"?: string | null,"object_type"?: string,"occurred_at"?: string,"reason"?: string | null,"restaurant_id"?: string | null,"user_agent"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"platform_languages": {
                  Row: {
                    "code": string,"dir": string,"is_enabled": boolean,"name": string,"native_name": string,"sort": number
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"dir"?: string,"is_enabled"?: boolean,"name": string,"native_name": string,"sort"?: number
                  }
                  Update: {
                    "code"?: string,"dir"?: string,"is_enabled"?: boolean,"name"?: string,"native_name"?: string,"sort"?: number
                  }
                  Relationships: [
                    
                  ]
                },"platform_settings": {
                  Row: {
                    "description": string,"key": string,"updated_at": string,"updated_by": string | null,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "description": string,"key": string,"updated_at"?: string,"updated_by"?: string | null,"value": NonNullable<Json>
                  }
                  Update: {
                    "description"?: string,"key"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"platform_staff": {
                  Row: {
                    "created_at": string,"is_active": boolean,"role": Database["public"]['Enums']["platform_role"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"is_active"?: boolean,"role": Database["public"]['Enums']["platform_role"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"is_active"?: boolean,"role"?: Database["public"]['Enums']["platform_role"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "analytics_opt_out": boolean,"created_at": string,"email": string | null,"full_name": string | null,"id": string,"locale": string,"marketing_opt_in": boolean,"phone_e164": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "analytics_opt_out"?: boolean,"created_at"?: string,"email"?: string | null,"full_name"?: string | null,"id": string,"locale"?: string,"marketing_opt_in"?: boolean,"phone_e164"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "analytics_opt_out"?: boolean,"created_at"?: string,"email"?: string | null,"full_name"?: string | null,"id"?: string,"locale"?: string,"marketing_opt_in"?: boolean,"phone_e164"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"promotion_branches": {
                  Row: {
                    "branch_id": string,"promotion_id": string,"restaurant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"promotion_id": string,"restaurant_id": string
                  }
                  Update: {
                    "branch_id"?: string,"promotion_id"?: string,"restaurant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "promotion_branches_branch_id_restaurant_id_fkey"
      columns: ["branch_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id","restaurant_id"]
    },{
      foreignKeyName: "promotion_branches_promotion_id_restaurant_id_fkey"
      columns: ["promotion_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "promotions"
      referencedColumns: ["id","restaurant_id"]
    }
                  ]
                },"promotions": {
                  Row: {
                    "archived_at": string | null,"body": NonNullable<Json>,"created_at": string,"created_by": string | null,"ends_at": string | null,"i18n_meta": NonNullable<Json>,"id": string,"image_path": string | null,"is_active": boolean,"item_id": string | null,"kind": Database["public"]['Enums']["promotion_kind"],"restaurant_id": string,"sort": number,"starts_at": string,"title": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"body"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"ends_at"?: string | null,"i18n_meta"?: NonNullable<Json>,"id"?: string,"image_path"?: string | null,"is_active"?: boolean,"item_id"?: string | null,"kind"?: Database["public"]['Enums']["promotion_kind"],"restaurant_id": string,"sort"?: number,"starts_at"?: string,"title": NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"body"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"ends_at"?: string | null,"i18n_meta"?: NonNullable<Json>,"id"?: string,"image_path"?: string | null,"is_active"?: boolean,"item_id"?: string | null,"kind"?: Database["public"]['Enums']["promotion_kind"],"restaurant_id"?: string,"sort"?: number,"starts_at"?: string,"title"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "promotions_item_id_restaurant_id_fkey"
      columns: ["item_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "menu_items"
      referencedColumns: ["id","restaurant_id"]
    },{
      foreignKeyName: "promotions_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"qr_codes": {
                  Row: {
                    "branch_id": string | null,"created_at": string,"created_by": string | null,"id": string,"is_active": boolean,"kind": Database["public"]['Enums']["qr_kind"],"label": string | null,"restaurant_id": string,"revoked_at": string | null,"table_id": string | null,"token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_active"?: boolean,"kind": Database["public"]['Enums']["qr_kind"],"label"?: string | null,"restaurant_id": string,"revoked_at"?: string | null,"table_id"?: string | null,"token": string
                  }
                  Update: {
                    "branch_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_active"?: boolean,"kind"?: Database["public"]['Enums']["qr_kind"],"label"?: string | null,"restaurant_id"?: string,"revoked_at"?: string | null,"table_id"?: string | null,"token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "qr_codes_branch_id_restaurant_id_fkey"
      columns: ["branch_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id","restaurant_id"]
    },{
      foreignKeyName: "qr_codes_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "qr_codes_table_id_restaurant_id_fkey"
      columns: ["table_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurant_tables"
      referencedColumns: ["id","restaurant_id"]
    }
                  ]
                },"reserved_slugs": {
                  Row: {
                    "slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "slug": string
                  }
                  Update: {
                    "slug"?: string
                  }
                  Relationships: [
                    
                  ]
                },"restaurant_domains": {
                  Row: {
                    "created_at": string,"created_by": string | null,"error": string | null,"hostname": string,"id": string,"is_primary": boolean,"kind": string,"last_checked_at": string | null,"restaurant_id": string,"status": Database["public"]['Enums']["domain_status"],"updated_at": string,"verification": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"error"?: string | null,"hostname": string,"id"?: string,"is_primary"?: boolean,"kind": string,"last_checked_at"?: string | null,"restaurant_id": string,"status"?: Database["public"]['Enums']["domain_status"],"updated_at"?: string,"verification"?: NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"error"?: string | null,"hostname"?: string,"id"?: string,"is_primary"?: boolean,"kind"?: string,"last_checked_at"?: string | null,"restaurant_id"?: string,"status"?: Database["public"]['Enums']["domain_status"],"updated_at"?: string,"verification"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "restaurant_domains_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"restaurant_entitlement_overrides": {
                  Row: {
                    "created_at": string,"created_by": string | null,"enabled": boolean,"expires_at": string | null,"feature_key": string,"limit_value": number | null,"reason": string,"restaurant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"enabled": boolean,"expires_at"?: string | null,"feature_key": string,"limit_value"?: number | null,"reason": string,"restaurant_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"enabled"?: boolean,"expires_at"?: string | null,"feature_key"?: string,"limit_value"?: number | null,"reason"?: string,"restaurant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "restaurant_entitlement_overrides_feature_key_fkey"
      columns: ["feature_key"]
isOneToOne: false
      referencedRelation: "features"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "restaurant_entitlement_overrides_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"restaurant_languages": {
                  Row: {
                    "created_at": string,"locale": string,"restaurant_id": string,"sort": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"locale": string,"restaurant_id": string,"sort"?: number
                  }
                  Update: {
                    "created_at"?: string,"locale"?: string,"restaurant_id"?: string,"sort"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "restaurant_languages_locale_fkey"
      columns: ["locale"]
isOneToOne: false
      referencedRelation: "platform_languages"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "restaurant_languages_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"restaurant_notifications": {
                  Row: {
                    "body": string | null,"branch_id": string | null,"created_at": string,"data": NonNullable<Json>,"id": string,"kind": string,"object_id": string | null,"object_type": string | null,"required_permission": string,"restaurant_id": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"branch_id"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"kind": string,"object_id"?: string | null,"object_type"?: string | null,"required_permission": string,"restaurant_id": string,"title": string
                  }
                  Update: {
                    "body"?: string | null,"branch_id"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"kind"?: string,"object_id"?: string | null,"object_type"?: string | null,"required_permission"?: string,"restaurant_id"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "restaurant_notifications_branch_id_restaurant_id_fkey"
      columns: ["branch_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id","restaurant_id"]
    },{
      foreignKeyName: "restaurant_notifications_required_permission_fkey"
      columns: ["required_permission"]
isOneToOne: false
      referencedRelation: "permissions"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "restaurant_notifications_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"restaurant_slug_history": {
                  Row: {
                    "changed_at": string,"changed_by": string | null,"old_slug": string,"restaurant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "changed_at"?: string,"changed_by"?: string | null,"old_slug": string,"restaurant_id": string
                  }
                  Update: {
                    "changed_at"?: string,"changed_by"?: string | null,"old_slug"?: string,"restaurant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "restaurant_slug_history_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"restaurant_tables": {
                  Row: {
                    "archived_at": string | null,"branch_id": string,"created_at": string,"created_by": string | null,"id": string,"is_active": boolean,"label": string,"restaurant_id": string,"section": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"branch_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_active"?: boolean,"label": string,"restaurant_id": string,"section"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"branch_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_active"?: boolean,"label"?: string,"restaurant_id"?: string,"section"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "restaurant_tables_branch_id_restaurant_id_fkey"
      columns: ["branch_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id","restaurant_id"]
    }
                  ]
                },"restaurants": {
                  Row: {
                    "archived_at": string | null,"contact_email": string | null,"contact_phone_e164": string | null,"country_code": string,"cover_path": string | null,"created_at": string,"created_by": string | null,"currency": string,"default_locale": string,"description": NonNullable<Json>,"id": string,"invite_ttl_hours": number,"logo_path": string | null,"name": string,"onboarding_completed_at": string | null,"platform_hold": boolean,"platform_hold_reason": string | null,"slug": string,"social_links": NonNullable<Json>,"staff_auto_lock_minutes": number,"status": Database["public"]['Enums']["restaurant_status"],"status_changed_at": string,"tagline": NonNullable<Json>,"terms_accepted_at": string | null,"terms_accepted_by": string | null,"terms_version": string | null,"timezone": string,"updated_at": string,"whatsapp_e164": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"contact_email"?: string | null,"contact_phone_e164"?: string | null,"country_code"?: string,"cover_path"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"default_locale"?: string,"description"?: NonNullable<Json>,"id"?: string,"invite_ttl_hours"?: number,"logo_path"?: string | null,"name": string,"onboarding_completed_at"?: string | null,"platform_hold"?: boolean,"platform_hold_reason"?: string | null,"slug": string,"social_links"?: NonNullable<Json>,"staff_auto_lock_minutes"?: number,"status"?: Database["public"]['Enums']["restaurant_status"],"status_changed_at"?: string,"tagline"?: NonNullable<Json>,"terms_accepted_at"?: string | null,"terms_accepted_by"?: string | null,"terms_version"?: string | null,"timezone"?: string,"updated_at"?: string,"whatsapp_e164"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"contact_email"?: string | null,"contact_phone_e164"?: string | null,"country_code"?: string,"cover_path"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"default_locale"?: string,"description"?: NonNullable<Json>,"id"?: string,"invite_ttl_hours"?: number,"logo_path"?: string | null,"name"?: string,"onboarding_completed_at"?: string | null,"platform_hold"?: boolean,"platform_hold_reason"?: string | null,"slug"?: string,"social_links"?: NonNullable<Json>,"staff_auto_lock_minutes"?: number,"status"?: Database["public"]['Enums']["restaurant_status"],"status_changed_at"?: string,"tagline"?: NonNullable<Json>,"terms_accepted_at"?: string | null,"terms_accepted_by"?: string | null,"terms_version"?: string | null,"timezone"?: string,"updated_at"?: string,"whatsapp_e164"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"role_permissions": {
                  Row: {
                    "permission_key": string,"role_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "permission_key": string,"role_id": string
                  }
                  Update: {
                    "permission_key"?: string,"role_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "role_permissions_permission_key_fkey"
      columns: ["permission_key"]
isOneToOne: false
      referencedRelation: "permissions"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "role_permissions_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                },"roles": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"description": string | null,"id": string,"is_new_staff": boolean,"is_owner": boolean,"is_system": boolean,"key": string,"name": string,"restaurant_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"is_new_staff"?: boolean,"is_owner"?: boolean,"is_system"?: boolean,"key": string,"name": string,"restaurant_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"is_new_staff"?: boolean,"is_owner"?: boolean,"is_system"?: boolean,"key"?: string,"name"?: string,"restaurant_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "roles_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"staff_invitations": {
                  Row: {
                    "cancelled_at": string | null,"consumed_at": string | null,"consumed_by": string | null,"created_at": string,"created_by": string | null,"expires_at": string,"full_name": string,"id": string,"membership_id": string,"opened_at": string | null,"phone_e164": string,"restaurant_id": string,"status": Database["public"]['Enums']["invitation_status"],"token_hash": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cancelled_at"?: string | null,"consumed_at"?: string | null,"consumed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"expires_at": string,"full_name": string,"id"?: string,"membership_id": string,"opened_at"?: string | null,"phone_e164": string,"restaurant_id": string,"status"?: Database["public"]['Enums']["invitation_status"],"token_hash": string,"updated_at"?: string
                  }
                  Update: {
                    "cancelled_at"?: string | null,"consumed_at"?: string | null,"consumed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string,"full_name"?: string,"id"?: string,"membership_id"?: string,"opened_at"?: string | null,"phone_e164"?: string,"restaurant_id"?: string,"status"?: Database["public"]['Enums']["invitation_status"],"token_hash"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_invitations_membership_id_restaurant_id_fkey"
      columns: ["membership_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id","restaurant_id"]
    },{
      foreignKeyName: "staff_invitations_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"subscription_periods": {
                  Row: {
                    "branch_unit_amount_minor": number | null,"created_at": string,"created_by": string | null,"currency": string | null,"ends_at": string,"extra_branches": number,"id": string,"invoice_id": string | null,"kind": Database["public"]['Enums']["period_kind"],"note": string | null,"plan_amount_minor": number | null,"plan_id": string,"restaurant_id": string,"starts_at": string,"superseded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_unit_amount_minor"?: number | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string | null,"ends_at": string,"extra_branches"?: number,"id"?: string,"invoice_id"?: string | null,"kind": Database["public"]['Enums']["period_kind"],"note"?: string | null,"plan_amount_minor"?: number | null,"plan_id": string,"restaurant_id": string,"starts_at": string,"superseded_by"?: string | null
                  }
                  Update: {
                    "branch_unit_amount_minor"?: number | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string | null,"ends_at"?: string,"extra_branches"?: number,"id"?: string,"invoice_id"?: string | null,"kind"?: Database["public"]['Enums']["period_kind"],"note"?: string | null,"plan_amount_minor"?: number | null,"plan_id"?: string,"restaurant_id"?: string,"starts_at"?: string,"superseded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscription_periods_invoice_fk"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "billing_invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscription_periods_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscription_periods_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscription_periods_superseded_by_fkey"
      columns: ["superseded_by"]
isOneToOne: false
      referencedRelation: "subscription_periods"
      referencedColumns: ["id"]
    }
                  ]
                },"template_purchases": {
                  Row: {
                    "created_at": string,"created_by": string | null,"currency": string,"id": string,"invoice_id": string,"paid_at": string | null,"price_minor": number,"restaurant_id": string,"status": Database["public"]['Enums']["template_purchase_status"],"template_key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"currency": string,"id"?: string,"invoice_id": string,"paid_at"?: string | null,"price_minor": number,"restaurant_id": string,"status"?: Database["public"]['Enums']["template_purchase_status"],"template_key": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"currency"?: string,"id"?: string,"invoice_id"?: string,"paid_at"?: string | null,"price_minor"?: number,"restaurant_id"?: string,"status"?: Database["public"]['Enums']["template_purchase_status"],"template_key"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "template_purchases_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: true
      referencedRelation: "billing_invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "template_purchases_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "template_purchases_template_key_fkey"
      columns: ["template_key"]
isOneToOne: false
      referencedRelation: "website_templates"
      referencedColumns: ["key"]
    }
                  ]
                },"trial_grants": {
                  Row: {
                    "granted_at": string,"granted_by": string | null,"id": string,"phone_e164": string,"reason": string | null,"restaurant_id": string,"source": Database["public"]['Enums']["trial_source"],"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "granted_at"?: string,"granted_by"?: string | null,"id"?: string,"phone_e164": string,"reason"?: string | null,"restaurant_id": string,"source": Database["public"]['Enums']["trial_source"],"user_id"?: string | null
                  }
                  Update: {
                    "granted_at"?: string,"granted_by"?: string | null,"id"?: string,"phone_e164"?: string,"reason"?: string | null,"restaurant_id"?: string,"source"?: Database["public"]['Enums']["trial_source"],"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "trial_grants_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"user_devices": {
                  Row: {
                    "first_seen_at": string,"id": string,"label": string | null,"last_seen_at": string,"revoked_at": string | null,"revoked_by": string | null,"token_hash": string,"trusted_at": string | null,"user_agent": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "first_seen_at"?: string,"id"?: string,"label"?: string | null,"last_seen_at"?: string,"revoked_at"?: string | null,"revoked_by"?: string | null,"token_hash": string,"trusted_at"?: string | null,"user_agent"?: string | null,"user_id": string
                  }
                  Update: {
                    "first_seen_at"?: string,"id"?: string,"label"?: string | null,"last_seen_at"?: string,"revoked_at"?: string | null,"revoked_by"?: string | null,"token_hash"?: string,"trusted_at"?: string | null,"user_agent"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"website_settings": {
                  Row: {
                    "is_published": boolean,"menu_style": Database["public"]['Enums']["menu_display_style"],"online_payment_enabled": boolean,"ordering_enabled": boolean,"restaurant_id": string,"seo_description": NonNullable<Json>,"seo_title": NonNullable<Json>,"show_branches": boolean,"show_gallery": boolean,"show_hours": boolean,"show_whatsapp": boolean,"template_key": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "is_published"?: boolean,"menu_style"?: Database["public"]['Enums']["menu_display_style"],"online_payment_enabled"?: boolean,"ordering_enabled"?: boolean,"restaurant_id": string,"seo_description"?: NonNullable<Json>,"seo_title"?: NonNullable<Json>,"show_branches"?: boolean,"show_gallery"?: boolean,"show_hours"?: boolean,"show_whatsapp"?: boolean,"template_key"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "is_published"?: boolean,"menu_style"?: Database["public"]['Enums']["menu_display_style"],"online_payment_enabled"?: boolean,"ordering_enabled"?: boolean,"restaurant_id"?: string,"seo_description"?: NonNullable<Json>,"seo_title"?: NonNullable<Json>,"show_branches"?: boolean,"show_gallery"?: boolean,"show_hours"?: boolean,"show_whatsapp"?: boolean,"template_key"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "website_settings_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: true
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "website_settings_template_fk"
      columns: ["template_key"]
isOneToOne: false
      referencedRelation: "website_templates"
      referencedColumns: ["key"]
    }
                  ]
                },"website_templates": {
                  Row: {
                    "created_at": string,"currency": string,"description": NonNullable<Json>,"is_active": boolean,"key": string,"name": NonNullable<Json>,"price_minor": number | null,"sort": number,"tier": Database["public"]['Enums']["template_tier"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"currency"?: string,"description"?: NonNullable<Json>,"is_active"?: boolean,"key": string,"name": NonNullable<Json>,"price_minor"?: number | null,"sort"?: number,"tier": Database["public"]['Enums']["template_tier"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"currency"?: string,"description"?: NonNullable<Json>,"is_active"?: boolean,"key"?: string,"name"?: NonNullable<Json>,"price_minor"?: number | null,"sort"?: number,"tier"?: Database["public"]['Enums']["template_tier"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_staff_invitation":
{ Args: { "p_token": string }; Returns: string
                           },
"add_custom_domain":
{ Args: { "p_hostname": string,"p_restaurant_id": string }; Returns: string
                           },
"ai_credit_balance":
{ Args: { "p_restaurant_id": string }; Returns: number
                           },
"ai_credit_pack_info":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"apply_menu_import":
{ Args: { "p_job_id": string,"p_payload": Json }; Returns: number
                           },
"archive_table":
{ Args: { "p_table_id": string }; Returns: undefined
                           },
"assign_staff_role":
{ Args: { "p_branch_ids"?: (string)[],"p_branch_scope": Database["public"]['Enums']["branch_scope"],"p_membership_id": string,"p_role_id": string }; Returns: undefined
                           },
"branch_open_status":
{ Args: { "p_restaurant_id": string }; Returns: Json
                           },
"buy_ai_credits":
{ Args: { "p_packs": number,"p_restaurant_id": string }; Returns: string
                           },
"buy_extra_branches":
{ Args: { "p_count": number,"p_restaurant_id": string }; Returns: string
                           },
"buy_template":
{ Args: { "p_restaurant_id": string,"p_template_key": string }; Returns: string
                           },
"cancel_ai_job":
{ Args: { "p_job_id": string }; Returns: undefined
                           },
"cancel_staff_invitation":
{ Args: { "p_membership_id": string }; Returns: undefined
                           },
"change_restaurant_slug":
{ Args: { "p_new_slug": string,"p_restaurant_id": string }; Returns: undefined
                           },
"change_staff_phone":
{ Args: { "p_membership_id": string,"p_new_phone": string,"p_reason": string }; Returns: undefined
                           },
"choose_plan":
{ Args: { "p_extra_branches"?: number,"p_plan_key": string,"p_restaurant_id": string }; Returns: string
                           },
"complete_menu_import":
{ Args: { "p_job_id": string,"p_result": Json }; Returns: string
                           },
"complete_onboarding":
{ Args: { "p_restaurant_id": string }; Returns: undefined
                           },
"complete_staff_verification":
{ Args: { "p_membership_id": string,"p_pin": string }; Returns: boolean
                           },
"complete_translation":
{ Args: { "p_job_id": string,"p_translated": Json }; Returns: string
                           },
"create_custom_role":
{ Args: { "p_description"?: string,"p_key": string,"p_name": string,"p_permission_keys": (string)[],"p_restaurant_id": string }; Returns: string
                           },
"create_general_qr":
{ Args: { "p_label": string,"p_restaurant_id": string }; Returns: string
                           },
"create_restaurant":
{ Args: { "p_accept_terms"?: boolean,"p_branch_name"?: string,"p_name": string,"p_slug": string }; Returns: string
                           },
"create_table":
{ Args: { "p_branch_id": string,"p_label": string,"p_section"?: string }; Returns: string
                           },
"delete_my_diner_data":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"dev_list_outbox":
{ Args: { "p_limit"?: number }; Returns: Json[]
                           },
"fail_ai_job":
{ Args: { "p_error": string,"p_job_id": string }; Returns: undefined
                           },
"get_invitation_preview":
{ Args: { "p_token": string }; Returns: Json
                           },
"get_my_context":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_public_contact":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_public_pricing":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"invite_staff":
{ Args: { "p_full_name": string,"p_intended_branch_id"?: string,"p_phone_e164": string,"p_restaurant_id": string }; Returns: string
                           },
"list_parked_sessions":
{ Args: { "p_device_token": string }; Returns: Json
                           },
"list_templates":
{ Args: { "p_include_inactive"?: boolean,"p_restaurant_id"?: string }; Returns: Json
                           },
"logout_all_devices":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"mark_translation_reviewed":
{ Args: { "p_entity": string,"p_id": string,"p_locale": string }; Returns: undefined
                           },
"my_favorites":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_permissions":
{ Args: { "p_restaurant_id": string }; Returns: (string)[]
                           },
"my_pin_is_set":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"open_invitation":
{ Args: { "p_token": string }; Returns: string
                           },
"park_device_session":
{ Args: { "p_ciphertext": string,"p_device_token": string,"p_user_id": string }; Returns: undefined
                           },
"pin_unlock":
{ Args: { "p_device_token": string,"p_pin": string,"p_user_id": string }; Returns: Json
                           },
"platform_add_staff":
{ Args: { "p_email": string,"p_role": Database["public"]['Enums']["platform_role"] }; Returns: string
                           },
"platform_adjust_ai_credits":
{ Args: { "p_delta": number,"p_reason": string,"p_restaurant_id": string }; Returns: undefined
                           },
"platform_get_restaurant_overview":
{ Args: { "p_reason": string,"p_restaurant_id": string }; Returns: Json
                           },
"platform_grant_trial":
{ Args: { "p_days": number,"p_reason": string,"p_restaurant_id": string }; Returns: undefined
                           },
"platform_list_invoices":
{ Args: { "p_limit"?: number,"p_status"?: Database["public"]['Enums']["invoice_status"] }; Returns: Json
                           },
"platform_list_restaurants":
{ Args: { "p_limit"?: number,"p_offset"?: number,"p_search"?: string,"p_status"?: Database["public"]['Enums']["restaurant_status"] }; Returns: Json
                           },
"platform_list_staff":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"platform_overview":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"platform_record_payment":
{ Args: { "p_amount_minor": number,"p_invoice_id": string,"p_method": Database["public"]['Enums']["payment_method"],"p_received_at"?: string,"p_reference": string }; Returns: string
                           },
"platform_restaurant_billing":
{ Args: { "p_restaurant_id": string }; Returns: Json
                           },
"platform_set_entitlement":
{ Args: { "p_enabled": boolean,"p_feature_key": string,"p_limit_value"?: number,"p_plan_key": string }; Returns: undefined
                           },
"platform_set_hold":
{ Args: { "p_hold": boolean,"p_reason": string,"p_restaurant_id": string }; Returns: undefined
                           },
"platform_set_language":
{ Args: { "p_code": string,"p_enabled": boolean }; Returns: undefined
                           },
"platform_set_price":
{ Args: { "p_amount_minor": number,"p_item_type": Database["public"]['Enums']["price_item"],"p_plan_key": string }; Returns: string
                           },
"platform_set_restaurant_override":
{ Args: { "p_enabled": boolean,"p_expires_at"?: string,"p_feature_key": string,"p_limit_value": number,"p_reason": string,"p_restaurant_id": string }; Returns: undefined
                           },
"platform_set_setting":
{ Args: { "p_key": string,"p_value": Json }; Returns: undefined
                           },
"platform_set_staff_active":
{ Args: { "p_active": boolean,"p_user_id": string }; Returns: undefined
                           },
"platform_upsert_template":
{ Args: { "p_description": Json,"p_is_active": boolean,"p_key": string,"p_name": Json,"p_price_minor": number,"p_sort": number,"p_tier": Database["public"]['Enums']["template_tier"] }; Returns: undefined
                           },
"platform_void_invoice":
{ Args: { "p_invoice_id": string,"p_reason": string }; Returns: undefined
                           },
"preview_site":
{ Args: { "p_restaurant_id": string,"p_template"?: string }; Returns: Json
                           },
"public_site":
{ Args: { "p_restaurant_id": string }; Returns: Json
                           },
"record_auth_event":
{ Args: { "p_action": string }; Returns: undefined
                           },
"regenerate_table_qr":
{ Args: { "p_table_id": string }; Returns: undefined
                           },
"register_trusted_device":
{ Args: { "p_device_token": string,"p_label"?: string,"p_user_agent"?: string }; Returns: string
                           },
"remove_custom_domain":
{ Args: { "p_domain_id": string }; Returns: string
                           },
"resend_staff_invitation":
{ Args: { "p_membership_id": string }; Returns: undefined
                           },
"reset_staff_pin":
{ Args: { "p_membership_id": string,"p_reason": string }; Returns: undefined
                           },
"resolve_host":
{ Args: { "p_hostname": string }; Returns: Json
                           },
"resolve_qr":
{ Args: { "p_session_id"?: string,"p_token": string }; Returns: Json
                           },
"resolve_restaurant_slug":
{ Args: { "p_slug": string }; Returns: Json
                           },
"restaurant_billing_overview":
{ Args: { "p_restaurant_id": string }; Returns: Json
                           },
"restaurant_dashboard":
{ Args: { "p_restaurant_id": string }; Returns: Json
                           },
"restaurant_entitlements":
{ Args: { "p_restaurant_id": string }; Returns: Json
                           },
"restaurant_setup_status":
{ Args: { "p_restaurant_id": string }; Returns: Json
                           },
"revoke_device":
{ Args: { "p_device_id": string }; Returns: undefined
                           },
"revoke_general_qr":
{ Args: { "p_qr_id": string }; Returns: undefined
                           },
"set_branch_hours":
{ Args: { "p_branch_id": string,"p_hours": Json }; Returns: undefined
                           },
"set_domain_status":
{ Args: { "p_domain_id": string,"p_error"?: string,"p_status": Database["public"]['Enums']["domain_status"],"p_verification"?: Json }; Returns: undefined
                           },
"set_my_pin":
{ Args: { "p_pin": string }; Returns: undefined
                           },
"set_primary_domain":
{ Args: { "p_domain_id": string }; Returns: undefined
                           },
"set_restaurant_languages":
{ Args: { "p_locales": (string)[],"p_restaurant_id": string }; Returns: undefined
                           },
"set_security_settings":
{ Args: { "p_auto_lock_minutes": number,"p_restaurant_id": string }; Returns: undefined
                           },
"set_staff_status":
{ Args: { "p_membership_id": string,"p_reason": string,"p_status": Database["public"]['Enums']["membership_status"] }; Returns: undefined
                           },
"set_table_active":
{ Args: { "p_active": boolean,"p_table_id": string }; Returns: undefined
                           },
"start_menu_import":
{ Args: { "p_restaurant_id": string,"p_source_path": string }; Returns: string
                           },
"start_translation":
{ Args: { "p_restaurant_id": string,"p_scope": Json,"p_target_locale": string }; Returns: Json
                           },
"track_event":
{ Args: { "p_branch_id"?: string,"p_entity_id"?: string,"p_event_type": Database["public"]['Enums']["analytics_event_type"],"p_locale"?: string,"p_qr_code_id"?: string,"p_restaurant_id": string,"p_session_id"?: string }; Returns: undefined
                           },
"unlock_ai_job":
{ Args: { "p_job_id": string }; Returns: undefined
                           },
"upgrade_plan":
{ Args: { "p_plan_key": string,"p_restaurant_id": string }; Returns: string
                           }
          }
          Enums: {
            "ai_credit_reason": "free_grant"|"purchase"|"import"|"translation"|"refund"|"adjustment","ai_job_kind": "menu_import"|"translation","ai_job_status": "processing"|"needs_credits"|"needs_review"|"completed"|"failed"|"cancelled","allergen": "gluten"|"crustaceans"|"eggs"|"fish"|"peanuts"|"soybeans"|"milk"|"tree_nuts"|"celery"|"mustard"|"sesame"|"sulphites"|"lupin"|"molluscs","analytics_event_type": "website_view"|"menu_view"|"item_view"|"frame_view"|"frame_complete"|"frame_click"|"promotion_view"|"promotion_click"|"qr_scan"|"go_click"|"share_click","branch_scope": "all"|"selected","branch_status_override": "auto"|"open"|"closed","dietary_tag": "vegetarian"|"vegan"|"halal"|"gluten_free"|"dairy_free"|"nut_free"|"healthy"|"new"|"popular"|"chef_special","domain_status": "not_connected"|"dns_required"|"verifying"|"connected"|"ssl_pending"|"active"|"error"|"disconnected","feature_kind": "flag"|"limit","invitation_status": "pending"|"opened"|"consumed"|"expired"|"cancelled"|"replaced","invoice_kind": "new_period"|"upgrade"|"extra_branches"|"ai_credits"|"template","invoice_status": "open"|"paid"|"void","media_kind": "image"|"video","membership_status": "invitation_sent"|"verification_pending"|"new_staff"|"active"|"expired"|"cancelled"|"locked"|"disabled"|"removed","menu_display_style": "list"|"grid"|"compact","payment_method": "bank_transfer"|"cash"|"card_offline"|"processor","period_kind": "trial"|"paid","permission_effect": "grant"|"deny","platform_role": "super_admin"|"admin"|"support"|"finance"|"content"|"discovery","price_item": "plan"|"extra_branch"|"ai_credits_pack","promotion_kind": "card"|"banner"|"carousel","qr_kind": "general"|"table","restaurant_status": "trial"|"active"|"past_due"|"grace"|"suspended"|"retention"|"expiring"|"deleted","template_purchase_status": "pending"|"paid"|"void","template_tier": "free"|"gold"|"paid","trial_source": "automatic"|"platform_exception"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "ai_credit_reason": ["free_grant", "purchase", "import", "translation", "refund", "adjustment"],"ai_job_kind": ["menu_import", "translation"],"ai_job_status": ["processing", "needs_credits", "needs_review", "completed", "failed", "cancelled"],"allergen": ["gluten", "crustaceans", "eggs", "fish", "peanuts", "soybeans", "milk", "tree_nuts", "celery", "mustard", "sesame", "sulphites", "lupin", "molluscs"],"analytics_event_type": ["website_view", "menu_view", "item_view", "frame_view", "frame_complete", "frame_click", "promotion_view", "promotion_click", "qr_scan", "go_click", "share_click"],"branch_scope": ["all", "selected"],"branch_status_override": ["auto", "open", "closed"],"dietary_tag": ["vegetarian", "vegan", "halal", "gluten_free", "dairy_free", "nut_free", "healthy", "new", "popular", "chef_special"],"domain_status": ["not_connected", "dns_required", "verifying", "connected", "ssl_pending", "active", "error", "disconnected"],"feature_kind": ["flag", "limit"],"invitation_status": ["pending", "opened", "consumed", "expired", "cancelled", "replaced"],"invoice_kind": ["new_period", "upgrade", "extra_branches", "ai_credits", "template"],"invoice_status": ["open", "paid", "void"],"media_kind": ["image", "video"],"membership_status": ["invitation_sent", "verification_pending", "new_staff", "active", "expired", "cancelled", "locked", "disabled", "removed"],"menu_display_style": ["list", "grid", "compact"],"payment_method": ["bank_transfer", "cash", "card_offline", "processor"],"period_kind": ["trial", "paid"],"permission_effect": ["grant", "deny"],"platform_role": ["super_admin", "admin", "support", "finance", "content", "discovery"],"price_item": ["plan", "extra_branch", "ai_credits_pack"],"promotion_kind": ["card", "banner", "carousel"],"qr_kind": ["general", "table"],"restaurant_status": ["trial", "active", "past_due", "grace", "suspended", "retention", "expiring", "deleted"],"template_purchase_status": ["pending", "paid", "void"],"template_tier": ["free", "gold", "paid"],"trial_source": ["automatic", "platform_exception"]
          }
        }
} as const
