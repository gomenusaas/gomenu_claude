
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
                    "archived_at": string | null,"country_code": string,"created_at": string,"created_by": string | null,"currency": string,"default_locale": string,"id": string,"invite_ttl_hours": number,"name": string,"slug": string,"status": Database["public"]['Enums']["restaurant_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"country_code"?: string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"default_locale"?: string,"id"?: string,"invite_ttl_hours"?: number,"name": string,"slug": string,"status"?: Database["public"]['Enums']["restaurant_status"],"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"country_code"?: string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"default_locale"?: string,"id"?: string,"invite_ttl_hours"?: number,"name"?: string,"slug"?: string,"status"?: Database["public"]['Enums']["restaurant_status"],"updated_at"?: string
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
"cancel_staff_invitation":
{ Args: { "p_membership_id": string }; Returns: undefined
                           },
"complete_staff_verification":
{ Args: { "p_membership_id": string,"p_pin": string }; Returns: boolean
                           },
"create_custom_role":
{ Args: { "p_description"?: string,"p_key": string,"p_name": string,"p_permission_keys": (string)[],"p_restaurant_id": string }; Returns: string
                           },
"create_restaurant":
{ Args: { "p_branch_name"?: string,"p_name": string,"p_slug": string }; Returns: string
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
"platform_get_restaurant_overview":
{ Args: { "p_reason": string,"p_restaurant_id": string }; Returns: Json
                           },
"resend_staff_invitation":
{ Args: { "p_membership_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "branch_scope": "all"|"selected","invitation_status": "pending"|"opened"|"consumed"|"expired"|"cancelled"|"replaced","membership_status": "invitation_sent"|"verification_pending"|"new_staff"|"active"|"expired"|"cancelled"|"locked"|"disabled"|"removed","permission_effect": "grant"|"deny","platform_role": "super_admin"|"admin"|"support"|"finance"|"content"|"discovery","restaurant_status": "trial"|"active"|"past_due"|"grace"|"suspended"|"retention"|"expiring"|"deleted"
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
            "branch_scope": ["all", "selected"],"invitation_status": ["pending", "opened", "consumed", "expired", "cancelled", "replaced"],"membership_status": ["invitation_sent", "verification_pending", "new_staff", "active", "expired", "cancelled", "locked", "disabled", "removed"],"permission_effect": ["grant", "deny"],"platform_role": ["super_admin", "admin", "support", "finance", "content", "discovery"],"restaurant_status": ["trial", "active", "past_due", "grace", "suspended", "retention", "expiring", "deleted"]
          }
        }
} as const
