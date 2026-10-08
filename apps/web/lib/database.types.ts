
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
            "audit_events": {
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
                    "branch_unit_amount_minor": number,"created_at": string,"created_by": string | null,"currency": string,"due_at": string,"extra_branches": number,"id": string,"issued_at": string,"kind": Database["public"]['Enums']["invoice_kind"],"lines": NonNullable<Json>,"number": string,"paid_at": string | null,"plan_amount_minor": number,"plan_id": string,"restaurant_id": string,"status": Database["public"]['Enums']["invoice_status"],"subtotal_minor": number,"tax_label": string,"tax_minor": number,"tax_rate_bp": number,"total_minor": number,"updated_at": string,"void_reason": string | null,"voided_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_unit_amount_minor": number,"created_at"?: string,"created_by"?: string | null,"currency": string,"due_at": string,"extra_branches"?: number,"id"?: string,"issued_at"?: string,"kind": Database["public"]['Enums']["invoice_kind"],"lines": NonNullable<Json>,"number": string,"paid_at"?: string | null,"plan_amount_minor": number,"plan_id": string,"restaurant_id": string,"status"?: Database["public"]['Enums']["invoice_status"],"subtotal_minor": number,"tax_label": string,"tax_minor": number,"tax_rate_bp": number,"total_minor": number,"updated_at"?: string,"void_reason"?: string | null,"voided_at"?: string | null
                  }
                  Update: {
                    "branch_unit_amount_minor"?: number,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"due_at"?: string,"extra_branches"?: number,"id"?: string,"issued_at"?: string,"kind"?: Database["public"]['Enums']["invoice_kind"],"lines"?: NonNullable<Json>,"number"?: string,"paid_at"?: string | null,"plan_amount_minor"?: number,"plan_id"?: string,"restaurant_id"?: string,"status"?: Database["public"]['Enums']["invoice_status"],"subtotal_minor"?: number,"tax_label"?: string,"tax_minor"?: number,"tax_rate_bp"?: number,"total_minor"?: number,"updated_at"?: string,"void_reason"?: string | null,"voided_at"?: string | null
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
                },"branches": {
                  Row: {
                    "address": string | null,"archived_at": string | null,"created_at": string,"id": string,"is_active": boolean,"name": string,"phone_e164": string | null,"restaurant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"archived_at"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"phone_e164"?: string | null,"restaurant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"archived_at"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"phone_e164"?: string | null,"restaurant_id"?: string,"updated_at"?: string
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
                    "created_at": string,"email": string | null,"full_name": string | null,"id": string,"locale": string,"phone_e164": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email"?: string | null,"full_name"?: string | null,"id": string,"locale"?: string,"phone_e164"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string | null,"full_name"?: string | null,"id"?: string,"locale"?: string,"phone_e164"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
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
                },"restaurants": {
                  Row: {
                    "archived_at": string | null,"country_code": string,"created_at": string,"created_by": string | null,"currency": string,"default_locale": string,"id": string,"invite_ttl_hours": number,"name": string,"onboarding_completed_at": string | null,"platform_hold": boolean,"platform_hold_reason": string | null,"slug": string,"status": Database["public"]['Enums']["restaurant_status"],"status_changed_at": string,"terms_accepted_at": string | null,"terms_accepted_by": string | null,"terms_version": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"country_code"?: string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"default_locale"?: string,"id"?: string,"invite_ttl_hours"?: number,"name": string,"onboarding_completed_at"?: string | null,"platform_hold"?: boolean,"platform_hold_reason"?: string | null,"slug": string,"status"?: Database["public"]['Enums']["restaurant_status"],"status_changed_at"?: string,"terms_accepted_at"?: string | null,"terms_accepted_by"?: string | null,"terms_version"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"country_code"?: string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"default_locale"?: string,"id"?: string,"invite_ttl_hours"?: number,"name"?: string,"onboarding_completed_at"?: string | null,"platform_hold"?: boolean,"platform_hold_reason"?: string | null,"slug"?: string,"status"?: Database["public"]['Enums']["restaurant_status"],"status_changed_at"?: string,"terms_accepted_at"?: string | null,"terms_accepted_by"?: string | null,"terms_version"?: string | null,"updated_at"?: string
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
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_staff_invitation":
{ Args: { "p_token": string }; Returns: string
                           },
"assign_staff_role":
{ Args: { "p_branch_ids"?: (string)[],"p_branch_scope": Database["public"]['Enums']["branch_scope"],"p_membership_id": string,"p_role_id": string }; Returns: undefined
                           },
"buy_extra_branches":
{ Args: { "p_count": number,"p_restaurant_id": string }; Returns: string
                           },
"cancel_staff_invitation":
{ Args: { "p_membership_id": string }; Returns: undefined
                           },
"choose_plan":
{ Args: { "p_extra_branches"?: number,"p_plan_key": string,"p_restaurant_id": string }; Returns: string
                           },
"complete_onboarding":
{ Args: { "p_restaurant_id": string }; Returns: undefined
                           },
"complete_staff_verification":
{ Args: { "p_membership_id": string,"p_pin": string }; Returns: boolean
                           },
"create_custom_role":
{ Args: { "p_description"?: string,"p_key": string,"p_name": string,"p_permission_keys": (string)[],"p_restaurant_id": string }; Returns: string
                           },
"create_restaurant":
{ Args: { "p_accept_terms"?: boolean,"p_branch_name"?: string,"p_name": string,"p_slug": string }; Returns: string
                           },
"dev_list_outbox":
{ Args: { "p_limit"?: number }; Returns: Json[]
                           },
"get_invitation_preview":
{ Args: { "p_token": string }; Returns: Json
                           },
"get_my_context":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_public_pricing":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"invite_staff":
{ Args: { "p_full_name": string,"p_intended_branch_id"?: string,"p_phone_e164": string,"p_restaurant_id": string }; Returns: string
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
"platform_add_staff":
{ Args: { "p_email": string,"p_role": Database["public"]['Enums']["platform_role"] }; Returns: string
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
"platform_void_invoice":
{ Args: { "p_invoice_id": string,"p_reason": string }; Returns: undefined
                           },
"resend_staff_invitation":
{ Args: { "p_membership_id": string }; Returns: undefined
                           },
"restaurant_billing_overview":
{ Args: { "p_restaurant_id": string }; Returns: Json
                           },
"restaurant_entitlements":
{ Args: { "p_restaurant_id": string }; Returns: Json
                           },
"restaurant_setup_status":
{ Args: { "p_restaurant_id": string }; Returns: Json
                           },
"upgrade_plan":
{ Args: { "p_plan_key": string,"p_restaurant_id": string }; Returns: string
                           }
          }
          Enums: {
            "branch_scope": "all"|"selected","feature_kind": "flag"|"limit","invitation_status": "pending"|"opened"|"consumed"|"expired"|"cancelled"|"replaced","invoice_kind": "new_period"|"upgrade"|"extra_branches","invoice_status": "open"|"paid"|"void","membership_status": "invitation_sent"|"verification_pending"|"new_staff"|"active"|"expired"|"cancelled"|"locked"|"disabled"|"removed","payment_method": "bank_transfer"|"cash"|"card_offline"|"processor","period_kind": "trial"|"paid","permission_effect": "grant"|"deny","platform_role": "super_admin"|"admin"|"support"|"finance"|"content"|"discovery","price_item": "plan"|"extra_branch","restaurant_status": "trial"|"active"|"past_due"|"grace"|"suspended"|"retention"|"expiring"|"deleted","trial_source": "automatic"|"platform_exception"
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
            "branch_scope": ["all", "selected"],"feature_kind": ["flag", "limit"],"invitation_status": ["pending", "opened", "consumed", "expired", "cancelled", "replaced"],"invoice_kind": ["new_period", "upgrade", "extra_branches"],"invoice_status": ["open", "paid", "void"],"membership_status": ["invitation_sent", "verification_pending", "new_staff", "active", "expired", "cancelled", "locked", "disabled", "removed"],"payment_method": ["bank_transfer", "cash", "card_offline", "processor"],"period_kind": ["trial", "paid"],"permission_effect": ["grant", "deny"],"platform_role": ["super_admin", "admin", "support", "finance", "content", "discovery"],"price_item": ["plan", "extra_branch"],"restaurant_status": ["trial", "active", "past_due", "grace", "suspended", "retention", "expiring", "deleted"],"trial_source": ["automatic", "platform_exception"]
          }
        }
} as const
