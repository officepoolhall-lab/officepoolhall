
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
            "audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"detail": Json | null,"id": number,"pool_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"detail"?: Json | null,"id"?: never,"pool_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"detail"?: Json | null,"id"?: never,"pool_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_log_pool_id_fkey"
      columns: ["pool_id"]
isOneToOne: false
      referencedRelation: "pools"
      referencedColumns: ["id"]
    }
                  ]
                },"game_lines": {
                  Row: {
                    "away_moneyline": number | null,"bookmaker": string,"captured_at": string,"game_id": string,"home_moneyline": number | null,"home_spread": number | null,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "away_moneyline"?: number | null,"bookmaker": string,"captured_at"?: string,"game_id": string,"home_moneyline"?: number | null,"home_spread"?: number | null,"id"?: never
                  }
                  Update: {
                    "away_moneyline"?: number | null,"bookmaker"?: string,"captured_at"?: string,"game_id"?: string,"home_moneyline"?: number | null,"home_spread"?: number | null,"id"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "game_lines_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    }
                  ]
                },"games": {
                  Row: {
                    "away_rank": number | null,"away_score": number | null,"away_team_id": string,"espn_id": string | null,"home_rank": number | null,"home_score": number | null,"home_team_id": string,"id": string,"manual_time": boolean,"neutral_site": boolean,"odds_api_id": string | null,"season": number,"sport": string,"start_at": string,"status": string,"time_tbd": boolean,"tv_network": string | null,"updated_at": string,"venue": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "away_rank"?: number | null,"away_score"?: number | null,"away_team_id": string,"espn_id"?: string | null,"home_rank"?: number | null,"home_score"?: number | null,"home_team_id": string,"id"?: string,"manual_time"?: boolean,"neutral_site"?: boolean,"odds_api_id"?: string | null,"season": number,"sport": string,"start_at": string,"status"?: string,"time_tbd"?: boolean,"tv_network"?: string | null,"updated_at"?: string,"venue"?: string | null
                  }
                  Update: {
                    "away_rank"?: number | null,"away_score"?: number | null,"away_team_id"?: string,"espn_id"?: string | null,"home_rank"?: number | null,"home_score"?: number | null,"home_team_id"?: string,"id"?: string,"manual_time"?: boolean,"neutral_site"?: boolean,"odds_api_id"?: string | null,"season"?: number,"sport"?: string,"start_at"?: string,"status"?: string,"time_tbd"?: boolean,"tv_network"?: string | null,"updated_at"?: string,"venue"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "games_away_team_id_fkey"
      columns: ["away_team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "games_home_team_id_fkey"
      columns: ["home_team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"invites": {
                  Row: {
                    "created_at": string,"expires_at": string | null,"id": string,"max_uses": number | null,"pool_id": string,"token": string,"uses": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at"?: string | null,"id"?: string,"max_uses"?: number | null,"pool_id": string,"token"?: string,"uses"?: number
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string | null,"id"?: string,"max_uses"?: number | null,"pool_id"?: string,"token"?: string,"uses"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "invites_pool_id_fkey"
      columns: ["pool_id"]
isOneToOne: false
      referencedRelation: "pools"
      referencedColumns: ["id"]
    }
                  ]
                },"picks": {
                  Row: {
                    "bonus": number | null,"confidence": number | null,"edited_at": string | null,"edited_by": string | null,"game_id": string,"id": string,"picked_side": string,"points": number | null,"result": string | null,"slate_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bonus"?: number | null,"confidence"?: number | null,"edited_at"?: string | null,"edited_by"?: string | null,"game_id": string,"id"?: string,"picked_side": string,"points"?: number | null,"result"?: string | null,"slate_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "bonus"?: number | null,"confidence"?: number | null,"edited_at"?: string | null,"edited_by"?: string | null,"game_id"?: string,"id"?: string,"picked_side"?: string,"points"?: number | null,"result"?: string | null,"slate_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "picks_edited_by_fkey"
      columns: ["edited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "picks_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "picks_slate_id_fkey"
      columns: ["slate_id"]
isOneToOne: false
      referencedRelation: "slates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "picks_slate_id_game_id_fkey"
      columns: ["slate_id","game_id"]
isOneToOne: false
      referencedRelation: "slate_games"
      referencedColumns: ["slate_id","game_id"]
    },{
      foreignKeyName: "picks_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"pool_creators": {
                  Row: {
                    "added_at": string,"email": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_at"?: string,"email": string
                  }
                  Update: {
                    "added_at"?: string,"email"?: string
                  }
                  Relationships: [
                    
                  ]
                },"pool_members": {
                  Row: {
                    "joined_at": string,"paid": boolean,"pool_id": string,"role": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "joined_at"?: string,"paid"?: boolean,"pool_id": string,"role"?: string,"user_id": string
                  }
                  Update: {
                    "joined_at"?: string,"paid"?: boolean,"pool_id"?: string,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pool_members_pool_id_fkey"
      columns: ["pool_id"]
isOneToOne: false
      referencedRelation: "pools"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pool_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"pools": {
                  Row: {
                    "commissioner_id": string,"created_at": string,"entry_fee": number,"id": string,"name": string,"season": number,"settings": NonNullable<Json>,"slug": string,"sport": string
                  }
                  ComputedFields: never
                  Insert: {
                    "commissioner_id": string,"created_at"?: string,"entry_fee"?: number,"id"?: string,"name": string,"season": number,"settings": NonNullable<Json>,"slug": string,"sport": string
                  }
                  Update: {
                    "commissioner_id"?: string,"created_at"?: string,"entry_fee"?: number,"id"?: string,"name"?: string,"season"?: number,"settings"?: NonNullable<Json>,"slug"?: string,"sport"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pools_commissioner_id_fkey"
      columns: ["commissioner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name": string,"id": string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"slate_games": {
                  Row: {
                    "game_id": string,"lock_at": string | null,"locked_home_spread": number | null,"locked_line_id": number | null,"override_away_score": number | null,"override_home_score": number | null,"slate_id": string,"sort_order": number | null,"voided": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "game_id": string,"lock_at"?: string | null,"locked_home_spread"?: number | null,"locked_line_id"?: number | null,"override_away_score"?: number | null,"override_home_score"?: number | null,"slate_id": string,"sort_order"?: number | null,"voided"?: boolean
                  }
                  Update: {
                    "game_id"?: string,"lock_at"?: string | null,"locked_home_spread"?: number | null,"locked_line_id"?: number | null,"override_away_score"?: number | null,"override_home_score"?: number | null,"slate_id"?: string,"sort_order"?: number | null,"voided"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "slate_games_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "slate_games_locked_line_id_fkey"
      columns: ["locked_line_id"]
isOneToOne: false
      referencedRelation: "game_lines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "slate_games_locked_line_id_fkey"
      columns: ["locked_line_id"]
isOneToOne: false
      referencedRelation: "latest_game_lines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "slate_games_slate_id_fkey"
      columns: ["slate_id"]
isOneToOne: false
      referencedRelation: "slates"
      referencedColumns: ["id"]
    }
                  ]
                },"slate_scores": {
                  Row: {
                    "bonus": number,"losses": number,"missed": boolean,"points": number,"pushes": number,"slate_id": string,"user_id": string,"wins": number
                  }
                  ComputedFields: never
                  Insert: {
                    "bonus"?: number,"losses"?: number,"missed"?: boolean,"points"?: number,"pushes"?: number,"slate_id": string,"user_id": string,"wins"?: number
                  }
                  Update: {
                    "bonus"?: number,"losses"?: number,"missed"?: boolean,"points"?: number,"pushes"?: number,"slate_id"?: string,"user_id"?: string,"wins"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "slate_scores_slate_id_fkey"
      columns: ["slate_id"]
isOneToOne: false
      referencedRelation: "slates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "slate_scores_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"slates": {
                  Row: {
                    "first_day_lock_at": string | null,"id": string,"label": string | null,"lock_at": string | null,"pool_id": string,"published_at": string | null,"status": string,"week": number,"window_end": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "first_day_lock_at"?: string | null,"id"?: string,"label"?: string | null,"lock_at"?: string | null,"pool_id": string,"published_at"?: string | null,"status"?: string,"week": number,"window_end": string,"window_start": string
                  }
                  Update: {
                    "first_day_lock_at"?: string | null,"id"?: string,"label"?: string | null,"lock_at"?: string | null,"pool_id"?: string,"published_at"?: string | null,"status"?: string,"week"?: number,"window_end"?: string,"window_start"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "slates_pool_id_fkey"
      columns: ["pool_id"]
isOneToOne: false
      referencedRelation: "pools"
      referencedColumns: ["id"]
    }
                  ]
                },"team_match_queue": {
                  Row: {
                    "first_seen_at": string,"id": number,"last_seen_at": string,"raw_id": string | null,"raw_name": string,"resolved": boolean,"source": string,"sport": string
                  }
                  ComputedFields: never
                  Insert: {
                    "first_seen_at"?: string,"id"?: never,"last_seen_at"?: string,"raw_id"?: string | null,"raw_name": string,"resolved"?: boolean,"source": string,"sport": string
                  }
                  Update: {
                    "first_seen_at"?: string,"id"?: never,"last_seen_at"?: string,"raw_id"?: string | null,"raw_name"?: string,"resolved"?: boolean,"source"?: string,"sport"?: string
                  }
                  Relationships: [
                    
                  ]
                },"teams": {
                  Row: {
                    "abbreviation": string | null,"conference": string | null,"espn_id": string | null,"id": string,"logo_url": string | null,"name": string,"odds_api_name": string | null,"short_name": string | null,"sport": string
                  }
                  ComputedFields: never
                  Insert: {
                    "abbreviation"?: string | null,"conference"?: string | null,"espn_id"?: string | null,"id"?: string,"logo_url"?: string | null,"name": string,"odds_api_name"?: string | null,"short_name"?: string | null,"sport": string
                  }
                  Update: {
                    "abbreviation"?: string | null,"conference"?: string | null,"espn_id"?: string | null,"id"?: string,"logo_url"?: string | null,"name"?: string,"odds_api_name"?: string | null,"short_name"?: string | null,"sport"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "latest_game_lines": {
                  Row: {
                    "away_moneyline": number | null,"bookmaker": string | null,"captured_at": string | null,"game_id": string | null,"home_moneyline": number | null,"home_spread": number | null,"id": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "game_lines_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "add_manual_game":
{ Args: { "p_away_team_id": string,"p_home_team_id": string,"p_neutral_site"?: boolean,"p_pool_id": string,"p_start_at": string,"p_tv_network"?: string }; Returns: string
                           },
"apply_half_point":
{ Args: { "p_force": boolean,"p_spread": number }; Returns: number
                           },
"can_create_pools":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"close_slates":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"create_pool":
{ Args: { "p_entry_fee": number,"p_name": string,"p_season": number,"p_settings": Json,"p_slug": string,"p_sport": string }; Returns: string
                           },
"effective_lock_at":
{ Args: { "p_deadline": string,"p_start": string,"p_time_tbd": boolean }; Returns: string
                           },
"freeze_slate_lines":
{ Args: { "p_slate_id": string }; Returns: undefined
                           },
"game_label":
{ Args: { "p_game_id": string }; Returns: string
                           },
"game_local_date":
{ Args: { "p_start": string,"p_time_tbd": boolean,"p_tz": string }; Returns: string
                           },
"game_locked":
{ Args: { "p_deadline": string,"p_start": string,"p_status": string,"p_time_tbd": boolean }; Returns: boolean
                           },
"game_started":
{ Args: { "p_start": string,"p_status": string,"p_time_tbd": boolean }; Returns: boolean
                           },
"game_time_frozen":
{ Args: { "p_game_id": string,"p_new_start": string,"p_new_status": string,"p_new_time_tbd": boolean,"p_start": string,"p_status": string,"p_time_tbd": boolean }; Returns: boolean
                           },
"games_to_poll":
{ Args: Record<PropertyKey, never>; Returns: {
              "game_id": string,"sport": string,"start_at": string
            }[]
                           },
"grade_game":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"grade_slate":
{ Args: { "p_slate_id": string }; Returns: undefined
                           },
"ingest_espn":
{ Args: { "p_games": Json,"p_sport": string,"p_teams": Json }; Returns: string[]
                           },
"invoke_edge_function":
{ Args: { "p_body"?: Json,"p_name": string }; Returns: undefined
                           },
"is_commissioner":
{ Args: { "p": string }; Returns: boolean
                           },
"is_pool_member":
{ Args: { "p": string }; Returns: boolean
                           },
"join_pool":
{ Args: { "p_token": string }; Returns: string
                           },
"line_sync_targets":
{ Args: Record<PropertyKey, never>; Returns: {
              "bookmaker": string,"sport": string
            }[]
                           },
"member_picks":
{ Args: { "p_slate_id": string,"p_user_id": string }; Returns: {
              "bonus": number | null,
"confidence": number | null,
"edited_at": string | null,
"edited_by": string | null,
"game_id": string,
"id": string,
"picked_side": string,
"points": number | null,
"result": string | null,
"slate_id": string,
"updated_at": string,
"user_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "picks"
        isOneToOne: false
        isSetofReturn: true
      } },
"pool_settings_core":
{ Args: { "s": Json }; Returns: Json
                           },
"publish_slate":
{ Args: { "p_slate_id": string }; Returns: undefined
                           },
"refresh_slate_locks":
{ Args: { "p_slate_id": string }; Returns: undefined
                           },
"resolve_team_match":
{ Args: { "p_queue_id": number,"p_team_id": string }; Returns: undefined
                           },
"set_game_time":
{ Args: { "p_game_id": string,"p_slate_id": string,"p_start_at": string }; Returns: undefined
                           },
"set_result_override":
{ Args: { "p_away_score": number,"p_game_id": string,"p_home_score": number,"p_slate_id": string }; Returns: undefined
                           },
"slate_progress":
{ Args: { "p_slate_id": string }; Returns: {
              "display_name": string,"picks": number,"user_id": string
            }[]
                           },
"submit_picks":
{ Args: { "p_picks": Json,"p_slate_id": string,"p_user_id"?: string }; Returns: undefined
                           },
"void_game":
{ Args: { "p_game_id": string,"p_slate_id": string,"p_voided"?: boolean }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
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
            
          }
        }
} as const
