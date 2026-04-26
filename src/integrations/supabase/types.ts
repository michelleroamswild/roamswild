export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      campsite_photos: {
        Row: {
          campsite_id: string
          caption: string | null
          created_at: string | null
          id: string
          is_primary: boolean | null
          url: string
          user_id: string
        }
        Insert: {
          campsite_id: string
          caption?: string | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          url: string
          user_id: string
        }
        Update: {
          campsite_id?: string
          caption?: string | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campsite_photos_campsite_id_fkey"
            columns: ["campsite_id"]
            isOneToOne: false
            referencedRelation: "campsites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campsite_photos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campsites: {
        Row: {
          cell_coverage: number | null
          confirmation_count: number | null
          created_at: string | null
          description: string | null
          fee_amount: string | null
          fee_required: boolean | null
          id: string
          is_confirmed: boolean | null
          lat: number
          lng: number
          location: unknown
          max_stay_days: number | null
          max_vehicles: number | null
          metadata: Json | null
          name: string
          notes: string | null
          original_spot_data: Json | null
          place_id: string | null
          potential_spot_id: string | null
          road_access: string | null
          seasonal_access: string | null
          source_type: string | null
          state: string | null
          tags: string[] | null
          type: string | null
          updated_at: string | null
          user_id: string
          visibility: string
          water_available: boolean | null
        }
        Insert: {
          cell_coverage?: number | null
          confirmation_count?: number | null
          created_at?: string | null
          description?: string | null
          fee_amount?: string | null
          fee_required?: boolean | null
          id?: string
          is_confirmed?: boolean | null
          lat: number
          lng: number
          location?: unknown
          max_stay_days?: number | null
          max_vehicles?: number | null
          metadata?: Json | null
          name: string
          notes?: string | null
          original_spot_data?: Json | null
          place_id?: string | null
          potential_spot_id?: string | null
          road_access?: string | null
          seasonal_access?: string | null
          source_type?: string | null
          state?: string | null
          tags?: string[] | null
          type?: string | null
          updated_at?: string | null
          user_id: string
          visibility?: string
          water_available?: boolean | null
        }
        Update: {
          cell_coverage?: number | null
          confirmation_count?: number | null
          created_at?: string | null
          description?: string | null
          fee_amount?: string | null
          fee_required?: boolean | null
          id?: string
          is_confirmed?: boolean | null
          lat?: number
          lng?: number
          location?: unknown
          max_stay_days?: number | null
          max_vehicles?: number | null
          metadata?: Json | null
          name?: string
          notes?: string | null
          original_spot_data?: Json | null
          place_id?: string | null
          potential_spot_id?: string | null
          road_access?: string | null
          seasonal_access?: string | null
          source_type?: string | null
          state?: string | null
          tags?: string[] | null
          type?: string | null
          updated_at?: string | null
          user_id?: string
          visibility?: string
          water_available?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "campsites_potential_spot_id_fkey"
            columns: ["potential_spot_id"]
            isOneToOne: false
            referencedRelation: "potential_spots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campsites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      critical_habitat: {
        Row: {
          area_acres: number | null
          boundary: unknown
          camping_restrictions: string | null
          created_at: string | null
          data_source_run_id: string | null
          effective_date: string | null
          external_id: string | null
          federal_register_citation: string | null
          id: string
          is_active: boolean | null
          listing_status: string | null
          scientific_name: string | null
          seasonal_restrictions: string | null
          source_type: string | null
          source_url: string | null
          species_name: string
          updated_at: string | null
        }
        Insert: {
          area_acres?: number | null
          boundary: unknown
          camping_restrictions?: string | null
          created_at?: string | null
          data_source_run_id?: string | null
          effective_date?: string | null
          external_id?: string | null
          federal_register_citation?: string | null
          id?: string
          is_active?: boolean | null
          listing_status?: string | null
          scientific_name?: string | null
          seasonal_restrictions?: string | null
          source_type?: string | null
          source_url?: string | null
          species_name: string
          updated_at?: string | null
        }
        Update: {
          area_acres?: number | null
          boundary?: unknown
          camping_restrictions?: string | null
          created_at?: string | null
          data_source_run_id?: string | null
          effective_date?: string | null
          external_id?: string | null
          federal_register_citation?: string | null
          id?: string
          is_active?: boolean | null
          listing_status?: string | null
          scientific_name?: string | null
          seasonal_restrictions?: string | null
          source_type?: string | null
          source_url?: string | null
          species_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      data_source_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          data_source_id: string | null
          error_details: Json | null
          error_message: string | null
          geographic_bounds: unknown
          id: string
          metrics_updated: number | null
          regions_created: number | null
          regions_updated: number | null
          source_checksum: string | null
          source_type: Database["public"]["Enums"]["data_source_type"]
          source_url: string | null
          source_version: string | null
          started_at: string
          status: Database["public"]["Enums"]["run_status"]
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          data_source_id?: string | null
          error_details?: Json | null
          error_message?: string | null
          geographic_bounds?: unknown
          id?: string
          metrics_updated?: number | null
          regions_created?: number | null
          regions_updated?: number | null
          source_checksum?: string | null
          source_type: Database["public"]["Enums"]["data_source_type"]
          source_url?: string | null
          source_version?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["run_status"]
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          data_source_id?: string | null
          error_details?: Json | null
          error_message?: string | null
          geographic_bounds?: unknown
          id?: string
          metrics_updated?: number | null
          regions_created?: number | null
          regions_updated?: number | null
          source_checksum?: string | null
          source_type?: Database["public"]["Enums"]["data_source_type"]
          source_url?: string | null
          source_version?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["run_status"]
        }
        Relationships: [
          {
            foreignKeyName: "data_source_runs_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      data_sources: {
        Row: {
          api_endpoint: string | null
          attribution_html: string | null
          attribution_required: boolean | null
          attribution_short: string | null
          attribution_text: string | null
          created_at: string | null
          display_name: string
          id: string
          is_active: boolean | null
          last_checked_at: string | null
          license_type: string | null
          license_url: string | null
          next_check_due: string | null
          notes: string | null
          release_date: string | null
          short_name: string | null
          source_key: string
          source_type: string
          source_url: string | null
          update_frequency: string | null
          updated_at: string | null
          version: string | null
        }
        Insert: {
          api_endpoint?: string | null
          attribution_html?: string | null
          attribution_required?: boolean | null
          attribution_short?: string | null
          attribution_text?: string | null
          created_at?: string | null
          display_name: string
          id?: string
          is_active?: boolean | null
          last_checked_at?: string | null
          license_type?: string | null
          license_url?: string | null
          next_check_due?: string | null
          notes?: string | null
          release_date?: string | null
          short_name?: string | null
          source_key: string
          source_type: string
          source_url?: string | null
          update_frequency?: string | null
          updated_at?: string | null
          version?: string | null
        }
        Update: {
          api_endpoint?: string | null
          attribution_html?: string | null
          attribution_required?: boolean | null
          attribution_short?: string | null
          attribution_text?: string | null
          created_at?: string | null
          display_name?: string
          id?: string
          is_active?: boolean | null
          last_checked_at?: string | null
          license_type?: string | null
          license_url?: string | null
          next_check_due?: string | null
          notes?: string | null
          release_date?: string | null
          short_name?: string | null
          source_key?: string
          source_type?: string
          source_url?: string | null
          update_frequency?: string | null
          updated_at?: string | null
          version?: string | null
        }
        Relationships: []
      }
      established_campgrounds: {
        Row: {
          agency_name: string | null
          created_at: string | null
          data_source_run_id: string | null
          deleted_at: string | null
          description: string | null
          facility_type: string | null
          fee_description: string | null
          forest_name: string | null
          has_fee: boolean | null
          has_showers: boolean | null
          has_toilets: boolean | null
          has_water: boolean | null
          id: string
          is_reservable: boolean | null
          last_synced_at: string | null
          lat: number | null
          lng: number | null
          location: unknown
          name: string
          osm_id: number | null
          public_land_id: string | null
          recreation_gov_url: string | null
          ridb_facility_id: string | null
          source_record_id: string | null
          source_type: Database["public"]["Enums"]["land_source_type"]
          updated_at: string | null
          usfs_rec_area_id: string | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          agency_name?: string | null
          created_at?: string | null
          data_source_run_id?: string | null
          deleted_at?: string | null
          description?: string | null
          facility_type?: string | null
          fee_description?: string | null
          forest_name?: string | null
          has_fee?: boolean | null
          has_showers?: boolean | null
          has_toilets?: boolean | null
          has_water?: boolean | null
          id?: string
          is_reservable?: boolean | null
          last_synced_at?: string | null
          lat?: number | null
          lng?: number | null
          location: unknown
          name: string
          osm_id?: number | null
          public_land_id?: string | null
          recreation_gov_url?: string | null
          ridb_facility_id?: string | null
          source_record_id?: string | null
          source_type: Database["public"]["Enums"]["land_source_type"]
          updated_at?: string | null
          usfs_rec_area_id?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          agency_name?: string | null
          created_at?: string | null
          data_source_run_id?: string | null
          deleted_at?: string | null
          description?: string | null
          facility_type?: string | null
          fee_description?: string | null
          forest_name?: string | null
          has_fee?: boolean | null
          has_showers?: boolean | null
          has_toilets?: boolean | null
          has_water?: boolean | null
          id?: string
          is_reservable?: boolean | null
          last_synced_at?: string | null
          lat?: number | null
          lng?: number | null
          location?: unknown
          name?: string
          osm_id?: number | null
          public_land_id?: string | null
          recreation_gov_url?: string | null
          ridb_facility_id?: string | null
          source_record_id?: string | null
          source_type?: Database["public"]["Enums"]["land_source_type"]
          updated_at?: string | null
          usfs_rec_area_id?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "established_campgrounds_public_land_id_fkey"
            columns: ["public_land_id"]
            isOneToOne: false
            referencedRelation: "public_lands"
            referencedColumns: ["id"]
          },
        ]
      }
      exclusion_zones: {
        Row: {
          boundary: unknown
          buffer_meters: number | null
          created_at: string | null
          data_source_run_id: string | null
          effective_date: string | null
          exclusion_type: Database["public"]["Enums"]["exclusion_type"]
          expiration_date: string | null
          external_id: string | null
          hazard_description: string | null
          id: string
          is_active: boolean | null
          is_permanent: boolean | null
          last_verified_at: string | null
          name: string | null
          reason: string | null
          severity: string
          source_type: string | null
          source_url: string | null
          updated_at: string | null
        }
        Insert: {
          boundary: unknown
          buffer_meters?: number | null
          created_at?: string | null
          data_source_run_id?: string | null
          effective_date?: string | null
          exclusion_type: Database["public"]["Enums"]["exclusion_type"]
          expiration_date?: string | null
          external_id?: string | null
          hazard_description?: string | null
          id?: string
          is_active?: boolean | null
          is_permanent?: boolean | null
          last_verified_at?: string | null
          name?: string | null
          reason?: string | null
          severity?: string
          source_type?: string | null
          source_url?: string | null
          updated_at?: string | null
        }
        Update: {
          boundary?: unknown
          buffer_meters?: number | null
          created_at?: string | null
          data_source_run_id?: string | null
          effective_date?: string | null
          exclusion_type?: Database["public"]["Enums"]["exclusion_type"]
          expiration_date?: string | null
          external_id?: string | null
          hazard_description?: string | null
          id?: string
          is_active?: boolean | null
          is_permanent?: boolean | null
          last_verified_at?: string | null
          name?: string | null
          reason?: string | null
          severity?: string
          source_type?: string | null
          source_url?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      friend_invites: {
        Row: {
          created_at: string | null
          id: string
          invited_email: string
          requester_id: string
          status: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          invited_email: string
          requester_id: string
          status?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          invited_email?: string
          requester_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "friend_invites_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      land_regulations: {
        Row: {
          applies_to_geometry: unknown
          authority_level: string | null
          buffer_distance_ft: number | null
          confidence_score: number | null
          created_at: string | null
          data_source_run_id: string | null
          description: string | null
          effective_date: string | null
          expiration_date: string | null
          id: string
          is_recurring: boolean | null
          issuing_agency: string | null
          last_verified_at: string | null
          max_group_size: number | null
          max_stay_days: number | null
          max_vehicles: number | null
          public_land_id: string | null
          recurrence_pattern: string | null
          region_id: string | null
          regulation_code: string | null
          regulation_type: Database["public"]["Enums"]["regulation_type"]
          restriction_level: string | null
          source_url: string | null
          status: Database["public"]["Enums"]["regulation_status"]
          title: string
          updated_at: string | null
        }
        Insert: {
          applies_to_geometry?: unknown
          authority_level?: string | null
          buffer_distance_ft?: number | null
          confidence_score?: number | null
          created_at?: string | null
          data_source_run_id?: string | null
          description?: string | null
          effective_date?: string | null
          expiration_date?: string | null
          id?: string
          is_recurring?: boolean | null
          issuing_agency?: string | null
          last_verified_at?: string | null
          max_group_size?: number | null
          max_stay_days?: number | null
          max_vehicles?: number | null
          public_land_id?: string | null
          recurrence_pattern?: string | null
          region_id?: string | null
          regulation_code?: string | null
          regulation_type: Database["public"]["Enums"]["regulation_type"]
          restriction_level?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["regulation_status"]
          title: string
          updated_at?: string | null
        }
        Update: {
          applies_to_geometry?: unknown
          authority_level?: string | null
          buffer_distance_ft?: number | null
          confidence_score?: number | null
          created_at?: string | null
          data_source_run_id?: string | null
          description?: string | null
          effective_date?: string | null
          expiration_date?: string | null
          id?: string
          is_recurring?: boolean | null
          issuing_agency?: string | null
          last_verified_at?: string | null
          max_group_size?: number | null
          max_stay_days?: number | null
          max_vehicles?: number | null
          public_land_id?: string | null
          recurrence_pattern?: string | null
          region_id?: string | null
          regulation_code?: string | null
          regulation_type?: Database["public"]["Enums"]["regulation_type"]
          restriction_level?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["regulation_status"]
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "land_regulations_public_land_id_fkey"
            columns: ["public_land_id"]
            isOneToOne: false
            referencedRelation: "public_lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "land_regulations_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "land_regulations_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions_with_metrics"
            referencedColumns: ["id"]
          },
        ]
      }
      loaded_regions: {
        Row: {
          analysed_at: string
          analysis_version: string
          bbox: unknown
          id: string
          source: string
          spot_count: number
        }
        Insert: {
          analysed_at?: string
          analysis_version?: string
          bbox: unknown
          id?: string
          source?: string
          spot_count?: number
        }
        Update: {
          analysed_at?: string
          analysis_version?: string
          bbox?: unknown
          id?: string
          source?: string
          spot_count?: number
        }
        Relationships: []
      }
      national_monuments: {
        Row: {
          admin_unit: string | null
          area_acres: number | null
          boundary: unknown
          camping_restrictions: string | null
          created_at: string | null
          data_source_run_id: string | null
          designating_authority: string | null
          designation_date: string | null
          designation_type: Database["public"]["Enums"]["designation_type"]
          dispersed_camping_allowed: boolean | null
          external_id: string | null
          id: string
          is_active: boolean | null
          managing_agency: string | null
          name: string
          proclamation_number: string | null
          source_type: string | null
          source_url: string | null
          updated_at: string | null
        }
        Insert: {
          admin_unit?: string | null
          area_acres?: number | null
          boundary: unknown
          camping_restrictions?: string | null
          created_at?: string | null
          data_source_run_id?: string | null
          designating_authority?: string | null
          designation_date?: string | null
          designation_type?: Database["public"]["Enums"]["designation_type"]
          dispersed_camping_allowed?: boolean | null
          external_id?: string | null
          id?: string
          is_active?: boolean | null
          managing_agency?: string | null
          name: string
          proclamation_number?: string | null
          source_type?: string | null
          source_url?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_unit?: string | null
          area_acres?: number | null
          boundary?: unknown
          camping_restrictions?: string | null
          created_at?: string | null
          data_source_run_id?: string | null
          designating_authority?: string | null
          designation_date?: string | null
          designation_type?: Database["public"]["Enums"]["designation_type"]
          dispersed_camping_allowed?: boolean | null
          external_id?: string | null
          id?: string
          is_active?: boolean | null
          managing_agency?: string | null
          name?: string
          proclamation_number?: string | null
          source_type?: string | null
          source_url?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      osm_way_history: {
        Row: {
          current_fwd_only: boolean | null
          current_grade: string | null
          fetched_at: string
          first_version_at: string | null
          fwd_only_seen: boolean[]
          grades_seen: string[]
          last_edit_at: string | null
          raw_history: Json | null
          versions_count: number
          way_id: number
        }
        Insert: {
          current_fwd_only?: boolean | null
          current_grade?: string | null
          fetched_at?: string
          first_version_at?: string | null
          fwd_only_seen?: boolean[]
          grades_seen?: string[]
          last_edit_at?: string | null
          raw_history?: Json | null
          versions_count?: number
          way_id: number
        }
        Update: {
          current_fwd_only?: boolean | null
          current_grade?: string | null
          fetched_at?: string
          first_version_at?: string | null
          fwd_only_seen?: boolean[]
          grades_seen?: string[]
          last_edit_at?: string | null
          raw_history?: Json | null
          versions_count?: number
          way_id?: number
        }
        Relationships: []
      }
      potential_spots: {
        Row: {
          admin_rejection_reason: string | null
          admin_verified_at: string | null
          admin_verified_by: string | null
          confidence_score: number
          created_at: string | null
          data_source_run_id: string | null
          deleted_at: string | null
          derivation_algorithm: string | null
          derivation_reasons: string[] | null
          derivation_run_id: string | null
          derivation_version: number | null
          derived_at: string | null
          id: string
          is_established_campground: boolean | null
          is_high_clearance_reachable: boolean | null
          is_near_private_road: boolean | null
          is_on_public_land: boolean | null
          is_passenger_reachable: boolean | null
          is_road_accessible: boolean | null
          land_protect_class: string | null
          land_protection_title: string | null
          land_unit_name: string | null
          lat: number | null
          lng: number | null
          location: unknown
          managing_agency: string | null
          name: string | null
          osm_camp_site_id: number | null
          osm_tags: Json | null
          public_land_id: string | null
          recommendation_score: number | null
          road_name: string | null
          road_segment_id: string | null
          score_breakdown: Json | null
          source_record_id: string | null
          source_type: Database["public"]["Enums"]["road_source_type"] | null
          spot_type: Database["public"]["Enums"]["spot_type"]
          status: Database["public"]["Enums"]["spot_status"]
          updated_at: string | null
          valid_from: string | null
          valid_to: string | null
          vehicle_access:
            | Database["public"]["Enums"]["vehicle_access_type"]
            | null
        }
        Insert: {
          admin_rejection_reason?: string | null
          admin_verified_at?: string | null
          admin_verified_by?: string | null
          confidence_score?: number
          created_at?: string | null
          data_source_run_id?: string | null
          deleted_at?: string | null
          derivation_algorithm?: string | null
          derivation_reasons?: string[] | null
          derivation_run_id?: string | null
          derivation_version?: number | null
          derived_at?: string | null
          id?: string
          is_established_campground?: boolean | null
          is_high_clearance_reachable?: boolean | null
          is_near_private_road?: boolean | null
          is_on_public_land?: boolean | null
          is_passenger_reachable?: boolean | null
          is_road_accessible?: boolean | null
          land_protect_class?: string | null
          land_protection_title?: string | null
          land_unit_name?: string | null
          lat?: number | null
          lng?: number | null
          location: unknown
          managing_agency?: string | null
          name?: string | null
          osm_camp_site_id?: number | null
          osm_tags?: Json | null
          public_land_id?: string | null
          recommendation_score?: number | null
          road_name?: string | null
          road_segment_id?: string | null
          score_breakdown?: Json | null
          source_record_id?: string | null
          source_type?: Database["public"]["Enums"]["road_source_type"] | null
          spot_type: Database["public"]["Enums"]["spot_type"]
          status?: Database["public"]["Enums"]["spot_status"]
          updated_at?: string | null
          valid_from?: string | null
          valid_to?: string | null
          vehicle_access?:
            | Database["public"]["Enums"]["vehicle_access_type"]
            | null
        }
        Update: {
          admin_rejection_reason?: string | null
          admin_verified_at?: string | null
          admin_verified_by?: string | null
          confidence_score?: number
          created_at?: string | null
          data_source_run_id?: string | null
          deleted_at?: string | null
          derivation_algorithm?: string | null
          derivation_reasons?: string[] | null
          derivation_run_id?: string | null
          derivation_version?: number | null
          derived_at?: string | null
          id?: string
          is_established_campground?: boolean | null
          is_high_clearance_reachable?: boolean | null
          is_near_private_road?: boolean | null
          is_on_public_land?: boolean | null
          is_passenger_reachable?: boolean | null
          is_road_accessible?: boolean | null
          land_protect_class?: string | null
          land_protection_title?: string | null
          land_unit_name?: string | null
          lat?: number | null
          lng?: number | null
          location?: unknown
          managing_agency?: string | null
          name?: string | null
          osm_camp_site_id?: number | null
          osm_tags?: Json | null
          public_land_id?: string | null
          recommendation_score?: number | null
          road_name?: string | null
          road_segment_id?: string | null
          score_breakdown?: Json | null
          source_record_id?: string | null
          source_type?: Database["public"]["Enums"]["road_source_type"] | null
          spot_type?: Database["public"]["Enums"]["spot_type"]
          status?: Database["public"]["Enums"]["spot_status"]
          updated_at?: string | null
          valid_from?: string | null
          valid_to?: string | null
          vehicle_access?:
            | Database["public"]["Enums"]["vehicle_access_type"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "potential_spots_public_land_id_fkey"
            columns: ["public_land_id"]
            isOneToOne: false
            referencedRelation: "public_lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "potential_spots_road_segment_id_fkey"
            columns: ["road_segment_id"]
            isOneToOne: false
            referencedRelation: "road_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      private_road_points: {
        Row: {
          access_type: string | null
          created_at: string | null
          data_source_run_id: string | null
          deleted_at: string | null
          id: number
          location: unknown
          osm_id: number | null
          source_record_id: string | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          access_type?: string | null
          created_at?: string | null
          data_source_run_id?: string | null
          deleted_at?: string | null
          id?: number
          location: unknown
          osm_id?: number | null
          source_record_id?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          access_type?: string | null
          created_at?: string | null
          data_source_run_id?: string | null
          deleted_at?: string | null
          id?: number
          location?: unknown
          osm_id?: number | null
          source_record_id?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          id: string
          name: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id: string
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      public_lands: {
        Row: {
          area_acres: number | null
          boundary: unknown
          camping_restrictions: string | null
          centroid: unknown
          created_at: string | null
          data_source_run_id: string | null
          deleted_at: string | null
          dispersed_camping_allowed: boolean | null
          external_id: string | null
          fire_restrictions: string | null
          id: string
          land_type: string | null
          managing_agency: string
          name: string
          source_record_id: string | null
          source_type: Database["public"]["Enums"]["land_source_type"]
          source_updated_at: string | null
          unit_name: string | null
          updated_at: string | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          area_acres?: number | null
          boundary: unknown
          camping_restrictions?: string | null
          centroid?: unknown
          created_at?: string | null
          data_source_run_id?: string | null
          deleted_at?: string | null
          dispersed_camping_allowed?: boolean | null
          external_id?: string | null
          fire_restrictions?: string | null
          id?: string
          land_type?: string | null
          managing_agency: string
          name: string
          source_record_id?: string | null
          source_type: Database["public"]["Enums"]["land_source_type"]
          source_updated_at?: string | null
          unit_name?: string | null
          updated_at?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          area_acres?: number | null
          boundary?: unknown
          camping_restrictions?: string | null
          centroid?: unknown
          created_at?: string | null
          data_source_run_id?: string | null
          deleted_at?: string | null
          dispersed_camping_allowed?: boolean | null
          external_id?: string | null
          fire_restrictions?: string | null
          id?: string
          land_type?: string | null
          managing_agency?: string
          name?: string
          source_record_id?: string | null
          source_type?: Database["public"]["Enums"]["land_source_type"]
          source_updated_at?: string | null
          unit_name?: string | null
          updated_at?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: []
      }
      region_features: {
        Row: {
          created_at: string
          description: string | null
          external_id: string | null
          feature_type: string
          id: string
          last_updated_by_run_id: string | null
          location: unknown
          metadata: Json | null
          name: string
          popularity_rank: number | null
          quality_rank: number | null
          region_id: string
          source_type: Database["public"]["Enums"]["data_source_type"] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          external_id?: string | null
          feature_type: string
          id?: string
          last_updated_by_run_id?: string | null
          location?: unknown
          metadata?: Json | null
          name: string
          popularity_rank?: number | null
          quality_rank?: number | null
          region_id: string
          source_type?: Database["public"]["Enums"]["data_source_type"] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          external_id?: string | null
          feature_type?: string
          id?: string
          last_updated_by_run_id?: string | null
          location?: unknown
          metadata?: Json | null
          name?: string
          popularity_rank?: number | null
          quality_rank?: number | null
          region_id?: string
          source_type?: Database["public"]["Enums"]["data_source_type"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "region_features_last_updated_by_run_id_fkey"
            columns: ["last_updated_by_run_id"]
            isOneToOne: false
            referencedRelation: "data_source_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "region_features_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "region_features_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions_with_metrics"
            referencedColumns: ["id"]
          },
        ]
      }
      region_metrics: {
        Row: {
          algorithm_version: string | null
          best_road_surface:
            | Database["public"]["Enums"]["road_surface_type"]
            | null
          campsite_count: number | null
          campsite_density_score: number | null
          campsite_types: Json | null
          cell_coverage_pct: number | null
          created_at: string
          current_snow_cover_pct: number | null
          current_snowline_ft: number | null
          dispersed_camping_allowed: boolean | null
          distance_to_interstate_miles: number | null
          distance_to_town_10k_miles: number | null
          elevation_avg_ft: number | null
          elevation_gain_total_ft: number | null
          elevation_max_ft: number | null
          elevation_min_ft: number | null
          has_cell_coverage: boolean | null
          has_paved_access: boolean | null
          id: string
          land_manager_breakdown: Json | null
          last_updated_by_run_id: string | null
          metrics_version: number | null
          monthly_bookings: number | null
          popularity_percentile: number | null
          popularity_score: number | null
          public_land_pct: number | null
          public_land_score: number | null
          quality_score: number | null
          raw_popularity: number | null
          region_id: string
          remoteness_score: number | null
          review_count: number | null
          road_access_score: number | null
          score_breakdown: Json | null
          score_computed_at: string | null
          seasonal_access_score: number | null
          seasonal_last_updated: string | null
          trail_count: number | null
          trail_density_per_sq_mile: number | null
          trail_density_score: number | null
          trail_diversity_index: number | null
          trail_total_miles: number | null
          trail_types: Json | null
          typical_season_end: number | null
          typical_season_start: number | null
          updated_at: string
          wiki_presence_score: number | null
        }
        Insert: {
          algorithm_version?: string | null
          best_road_surface?:
            | Database["public"]["Enums"]["road_surface_type"]
            | null
          campsite_count?: number | null
          campsite_density_score?: number | null
          campsite_types?: Json | null
          cell_coverage_pct?: number | null
          created_at?: string
          current_snow_cover_pct?: number | null
          current_snowline_ft?: number | null
          dispersed_camping_allowed?: boolean | null
          distance_to_interstate_miles?: number | null
          distance_to_town_10k_miles?: number | null
          elevation_avg_ft?: number | null
          elevation_gain_total_ft?: number | null
          elevation_max_ft?: number | null
          elevation_min_ft?: number | null
          has_cell_coverage?: boolean | null
          has_paved_access?: boolean | null
          id?: string
          land_manager_breakdown?: Json | null
          last_updated_by_run_id?: string | null
          metrics_version?: number | null
          monthly_bookings?: number | null
          popularity_percentile?: number | null
          popularity_score?: number | null
          public_land_pct?: number | null
          public_land_score?: number | null
          quality_score?: number | null
          raw_popularity?: number | null
          region_id: string
          remoteness_score?: number | null
          review_count?: number | null
          road_access_score?: number | null
          score_breakdown?: Json | null
          score_computed_at?: string | null
          seasonal_access_score?: number | null
          seasonal_last_updated?: string | null
          trail_count?: number | null
          trail_density_per_sq_mile?: number | null
          trail_density_score?: number | null
          trail_diversity_index?: number | null
          trail_total_miles?: number | null
          trail_types?: Json | null
          typical_season_end?: number | null
          typical_season_start?: number | null
          updated_at?: string
          wiki_presence_score?: number | null
        }
        Update: {
          algorithm_version?: string | null
          best_road_surface?:
            | Database["public"]["Enums"]["road_surface_type"]
            | null
          campsite_count?: number | null
          campsite_density_score?: number | null
          campsite_types?: Json | null
          cell_coverage_pct?: number | null
          created_at?: string
          current_snow_cover_pct?: number | null
          current_snowline_ft?: number | null
          dispersed_camping_allowed?: boolean | null
          distance_to_interstate_miles?: number | null
          distance_to_town_10k_miles?: number | null
          elevation_avg_ft?: number | null
          elevation_gain_total_ft?: number | null
          elevation_max_ft?: number | null
          elevation_min_ft?: number | null
          has_cell_coverage?: boolean | null
          has_paved_access?: boolean | null
          id?: string
          land_manager_breakdown?: Json | null
          last_updated_by_run_id?: string | null
          metrics_version?: number | null
          monthly_bookings?: number | null
          popularity_percentile?: number | null
          popularity_score?: number | null
          public_land_pct?: number | null
          public_land_score?: number | null
          quality_score?: number | null
          raw_popularity?: number | null
          region_id?: string
          remoteness_score?: number | null
          review_count?: number | null
          road_access_score?: number | null
          score_breakdown?: Json | null
          score_computed_at?: string | null
          seasonal_access_score?: number | null
          seasonal_last_updated?: string | null
          trail_count?: number | null
          trail_density_per_sq_mile?: number | null
          trail_density_score?: number | null
          trail_diversity_index?: number | null
          trail_total_miles?: number | null
          trail_types?: Json | null
          typical_season_end?: number | null
          typical_season_start?: number | null
          updated_at?: string
          wiki_presence_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "region_metrics_last_updated_by_run_id_fkey"
            columns: ["last_updated_by_run_id"]
            isOneToOne: false
            referencedRelation: "data_source_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "region_metrics_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: true
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "region_metrics_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: true
            referencedRelation: "regions_with_metrics"
            referencedColumns: ["id"]
          },
        ]
      }
      regions: {
        Row: {
          area_sq_miles: number | null
          bbox_east: number
          bbox_north: number
          bbox_south: number
          bbox_west: number
          bounds: unknown
          center: unknown
          created_at: string
          created_by_run_id: string | null
          description: string | null
          h3_index: string | null
          id: string
          is_active: boolean | null
          is_curated: boolean | null
          last_updated_by_run_id: string | null
          name: string
          parent_region_id: string | null
          primary_biome: Database["public"]["Enums"]["biome_type"] | null
          region_type: string | null
          secondary_biomes: Database["public"]["Enums"]["biome_type"][] | null
          slug: string
          tagline: string | null
          updated_at: string
        }
        Insert: {
          area_sq_miles?: number | null
          bbox_east: number
          bbox_north: number
          bbox_south: number
          bbox_west: number
          bounds: unknown
          center: unknown
          created_at?: string
          created_by_run_id?: string | null
          description?: string | null
          h3_index?: string | null
          id?: string
          is_active?: boolean | null
          is_curated?: boolean | null
          last_updated_by_run_id?: string | null
          name: string
          parent_region_id?: string | null
          primary_biome?: Database["public"]["Enums"]["biome_type"] | null
          region_type?: string | null
          secondary_biomes?: Database["public"]["Enums"]["biome_type"][] | null
          slug: string
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          area_sq_miles?: number | null
          bbox_east?: number
          bbox_north?: number
          bbox_south?: number
          bbox_west?: number
          bounds?: unknown
          center?: unknown
          created_at?: string
          created_by_run_id?: string | null
          description?: string | null
          h3_index?: string | null
          id?: string
          is_active?: boolean | null
          is_curated?: boolean | null
          last_updated_by_run_id?: string | null
          name?: string
          parent_region_id?: string | null
          primary_biome?: Database["public"]["Enums"]["biome_type"] | null
          region_type?: string | null
          secondary_biomes?: Database["public"]["Enums"]["biome_type"][] | null
          slug?: string
          tagline?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "regions_created_by_run_id_fkey"
            columns: ["created_by_run_id"]
            isOneToOne: false
            referencedRelation: "data_source_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regions_last_updated_by_run_id_fkey"
            columns: ["last_updated_by_run_id"]
            isOneToOne: false
            referencedRelation: "data_source_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regions_parent_region_id_fkey"
            columns: ["parent_region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regions_parent_region_id_fkey"
            columns: ["parent_region_id"]
            isOneToOne: false
            referencedRelation: "regions_with_metrics"
            referencedColumns: ["id"]
          },
        ]
      }
      road_closures: {
        Row: {
          affects_primary_access: boolean | null
          closure_location: unknown
          closure_type: string | null
          created_at: string
          expected_end_date: string | null
          id: string
          is_full_closure: boolean | null
          is_indefinite: boolean | null
          last_verified_at: string | null
          region_id: string | null
          road_name: string
          road_osm_id: number | null
          road_segment: string | null
          source_agency: string | null
          source_url: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          affects_primary_access?: boolean | null
          closure_location?: unknown
          closure_type?: string | null
          created_at?: string
          expected_end_date?: string | null
          id?: string
          is_full_closure?: boolean | null
          is_indefinite?: boolean | null
          last_verified_at?: string | null
          region_id?: string | null
          road_name: string
          road_osm_id?: number | null
          road_segment?: string | null
          source_agency?: string | null
          source_url?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          affects_primary_access?: boolean | null
          closure_location?: unknown
          closure_type?: string | null
          created_at?: string
          expected_end_date?: string | null
          id?: string
          is_full_closure?: boolean | null
          is_indefinite?: boolean | null
          last_verified_at?: string | null
          region_id?: string | null
          road_name?: string
          road_osm_id?: number | null
          road_segment?: string | null
          source_agency?: string | null
          source_url?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "road_closures_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "road_closures_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions_with_metrics"
            referencedColumns: ["id"]
          },
        ]
      }
      road_segments: {
        Row: {
          access: string | null
          created_at: string | null
          data_source_run_id: string | null
          deleted_at: string | null
          end_node_key: string | null
          end_point: unknown
          external_id: string | null
          four_wd_only: boolean | null
          geometry: unknown
          highway: string | null
          id: string
          length_miles: number | null
          mvum_tags: Json | null
          name: string | null
          osm_tags: Json | null
          public_land_id: string | null
          route_number: string | null
          seasonal_closure: string | null
          source_record_id: string | null
          source_type: Database["public"]["Enums"]["road_source_type"]
          start_node_key: string | null
          start_point: unknown
          surface_type: string | null
          tracktype: string | null
          updated_at: string | null
          valid_from: string | null
          valid_to: string | null
          vehicle_access: Database["public"]["Enums"]["vehicle_access_type"]
        }
        Insert: {
          access?: string | null
          created_at?: string | null
          data_source_run_id?: string | null
          deleted_at?: string | null
          end_node_key?: string | null
          end_point?: unknown
          external_id?: string | null
          four_wd_only?: boolean | null
          geometry: unknown
          highway?: string | null
          id?: string
          length_miles?: number | null
          mvum_tags?: Json | null
          name?: string | null
          osm_tags?: Json | null
          public_land_id?: string | null
          route_number?: string | null
          seasonal_closure?: string | null
          source_record_id?: string | null
          source_type: Database["public"]["Enums"]["road_source_type"]
          start_node_key?: string | null
          start_point?: unknown
          surface_type?: string | null
          tracktype?: string | null
          updated_at?: string | null
          valid_from?: string | null
          valid_to?: string | null
          vehicle_access?: Database["public"]["Enums"]["vehicle_access_type"]
        }
        Update: {
          access?: string | null
          created_at?: string | null
          data_source_run_id?: string | null
          deleted_at?: string | null
          end_node_key?: string | null
          end_point?: unknown
          external_id?: string | null
          four_wd_only?: boolean | null
          geometry?: unknown
          highway?: string | null
          id?: string
          length_miles?: number | null
          mvum_tags?: Json | null
          name?: string | null
          osm_tags?: Json | null
          public_land_id?: string | null
          route_number?: string | null
          seasonal_closure?: string | null
          source_record_id?: string | null
          source_type?: Database["public"]["Enums"]["road_source_type"]
          start_node_key?: string | null
          start_point?: unknown
          surface_type?: string | null
          tracktype?: string | null
          updated_at?: string | null
          valid_from?: string | null
          valid_to?: string | null
          vehicle_access?: Database["public"]["Enums"]["vehicle_access_type"]
        }
        Relationships: [
          {
            foreignKeyName: "road_segments_public_land_id_fkey"
            columns: ["public_land_id"]
            isOneToOne: false
            referencedRelation: "public_lands"
            referencedColumns: ["id"]
          },
        ]
      }
      roadless_areas: {
        Row: {
          area_acres: number | null
          boundary: unknown
          created_at: string | null
          data_source_run_id: string | null
          external_id: string | null
          forest_name: string | null
          id: string
          ira_id: string | null
          is_active: boolean | null
          name: string | null
          ranger_district: string | null
          roadless_rule_applies: boolean | null
          source_type: string | null
          source_url: string | null
          state: string | null
          updated_at: string | null
        }
        Insert: {
          area_acres?: number | null
          boundary: unknown
          created_at?: string | null
          data_source_run_id?: string | null
          external_id?: string | null
          forest_name?: string | null
          id?: string
          ira_id?: string | null
          is_active?: boolean | null
          name?: string | null
          ranger_district?: string | null
          roadless_rule_applies?: boolean | null
          source_type?: string | null
          source_url?: string | null
          state?: string | null
          updated_at?: string | null
        }
        Update: {
          area_acres?: number | null
          boundary?: unknown
          created_at?: string | null
          data_source_run_id?: string | null
          external_id?: string | null
          forest_name?: string | null
          id?: string
          ira_id?: string | null
          is_active?: boolean | null
          name?: string | null
          ranger_district?: string | null
          roadless_rule_applies?: boolean | null
          source_type?: string | null
          source_url?: string | null
          state?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      saved_locations: {
        Row: {
          address: string | null
          id: string
          lat: number
          lng: number
          name: string
          place_id: string
          saved_at: string | null
          type: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          id?: string
          lat: number
          lng: number
          name: string
          place_id: string
          saved_at?: string | null
          type?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          id?: string
          lat?: number
          lng?: number
          name?: string
          place_id?: string
          saved_at?: string | null
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_locations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_trips: {
        Row: {
          config: Json
          created_at: string | null
          days: Json
          id: string
          name: string
          owner_id: string | null
          total_distance: string | null
          total_driving_time: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          config: Json
          created_at?: string | null
          days: Json
          id?: string
          name: string
          owner_id?: string | null
          total_distance?: string | null
          total_driving_time?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string | null
          days?: Json
          id?: string
          name?: string
          owner_id?: string | null
          total_distance?: string | null
          total_driving_time?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_trips_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_trips_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      seasonal_conditions: {
        Row: {
          active_alerts: Json | null
          created_at: string
          data_source_run_id: string | null
          id: string
          precip_chance_pct: number | null
          primary_access_open: boolean | null
          recorded_date: string
          region_id: string
          roads_open_pct: number | null
          snow_cover_pct: number | null
          snow_depth_inches: number | null
          snowline_ft: number | null
          source_type: Database["public"]["Enums"]["data_source_type"] | null
          temp_high_f: number | null
          temp_low_f: number | null
        }
        Insert: {
          active_alerts?: Json | null
          created_at?: string
          data_source_run_id?: string | null
          id?: string
          precip_chance_pct?: number | null
          primary_access_open?: boolean | null
          recorded_date: string
          region_id: string
          roads_open_pct?: number | null
          snow_cover_pct?: number | null
          snow_depth_inches?: number | null
          snowline_ft?: number | null
          source_type?: Database["public"]["Enums"]["data_source_type"] | null
          temp_high_f?: number | null
          temp_low_f?: number | null
        }
        Update: {
          active_alerts?: Json | null
          created_at?: string
          data_source_run_id?: string | null
          id?: string
          precip_chance_pct?: number | null
          primary_access_open?: boolean | null
          recorded_date?: string
          region_id?: string
          roads_open_pct?: number | null
          snow_cover_pct?: number | null
          snow_depth_inches?: number | null
          snowline_ft?: number | null
          source_type?: Database["public"]["Enums"]["data_source_type"] | null
          temp_high_f?: number | null
          temp_low_f?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "seasonal_conditions_data_source_run_id_fkey"
            columns: ["data_source_run_id"]
            isOneToOne: false
            referencedRelation: "data_source_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seasonal_conditions_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seasonal_conditions_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions_with_metrics"
            referencedColumns: ["id"]
          },
        ]
      }
      spot_analyses: {
        Row: {
          analysis: Json
          created_at: string
          id: string
          lat: number
          lat_key: number | null
          lng: number
          lng_key: number | null
          model_version: string
          spot_name: string | null
          spot_type: string | null
        }
        Insert: {
          analysis: Json
          created_at?: string
          id?: string
          lat: number
          lat_key?: number | null
          lng: number
          lng_key?: number | null
          model_version?: string
          spot_name?: string | null
          spot_type?: string | null
        }
        Update: {
          analysis?: Json
          created_at?: string
          id?: string
          lat?: number
          lat_key?: number | null
          lng?: number
          lng_key?: number | null
          model_version?: string
          spot_name?: string | null
          spot_type?: string | null
        }
        Relationships: []
      }
      spot_confirmations: {
        Row: {
          campsite_id: string
          created_at: string | null
          id: string
          notes: string | null
          user_id: string
        }
        Insert: {
          campsite_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          user_id: string
        }
        Update: {
          campsite_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spot_confirmations_campsite_id_fkey"
            columns: ["campsite_id"]
            isOneToOne: false
            referencedRelation: "campsites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spot_confirmations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      surprise_history: {
        Row: {
          candidates_count: number | null
          clicked_at: string | null
          clicked_through: boolean | null
          distance_miles: number | null
          id: string
          recommended_at: string
          region_biome: Database["public"]["Enums"]["biome_type"] | null
          region_id: string
          region_name: string
          request_params: Json | null
          saved_to_trips: boolean | null
          score_at_selection: number | null
          score_breakdown: Json | null
          selection_attempt: number | null
          session_id: string | null
          user_id: string | null
          user_lat: number | null
          user_lng: number | null
          was_fallback: boolean | null
        }
        Insert: {
          candidates_count?: number | null
          clicked_at?: string | null
          clicked_through?: boolean | null
          distance_miles?: number | null
          id?: string
          recommended_at?: string
          region_biome?: Database["public"]["Enums"]["biome_type"] | null
          region_id: string
          region_name: string
          request_params?: Json | null
          saved_to_trips?: boolean | null
          score_at_selection?: number | null
          score_breakdown?: Json | null
          selection_attempt?: number | null
          session_id?: string | null
          user_id?: string | null
          user_lat?: number | null
          user_lng?: number | null
          was_fallback?: boolean | null
        }
        Update: {
          candidates_count?: number | null
          clicked_at?: string | null
          clicked_through?: boolean | null
          distance_miles?: number | null
          id?: string
          recommended_at?: string
          region_biome?: Database["public"]["Enums"]["biome_type"] | null
          region_id?: string
          region_name?: string
          request_params?: Json | null
          saved_to_trips?: boolean | null
          score_at_selection?: number | null
          score_breakdown?: Json | null
          selection_attempt?: number | null
          session_id?: string | null
          user_id?: string | null
          user_lat?: number | null
          user_lng?: number | null
          was_fallback?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "surprise_history_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surprise_history_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions_with_metrics"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_activity: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          trip_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          trip_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          trip_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_activity_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "saved_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_collaborators: {
        Row: {
          id: string
          invited_at: string | null
          invited_by: string | null
          permission: string
          trip_id: string
          user_id: string
        }
        Insert: {
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          permission: string
          trip_id: string
          user_id: string
        }
        Update: {
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          permission?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_collaborators_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_collaborators_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "saved_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_collaborators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_drafts: {
        Row: {
          created_at: string
          current_step: number
          id: string
          updated_at: string
          user_id: string
          wizard_state: Json
        }
        Insert: {
          created_at?: string
          current_step?: number
          id?: string
          updated_at?: string
          user_id: string
          wizard_state: Json
        }
        Update: {
          created_at?: string
          current_step?: number
          id?: string
          updated_at?: string
          user_id?: string
          wizard_state?: Json
        }
        Relationships: []
      }
      trip_share_links: {
        Row: {
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          permission: string
          token: string
          trip_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          permission: string
          token?: string
          trip_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          permission?: string
          token?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_share_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_share_links_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "saved_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      user_friends: {
        Row: {
          addressee_id: string
          created_at: string | null
          id: string
          requester_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          addressee_id: string
          created_at?: string | null
          id?: string
          requester_id: string
          status: string
          updated_at?: string | null
        }
        Update: {
          addressee_id?: string
          created_at?: string | null
          id?: string
          requester_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_friends_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_friends_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          approved_at: string | null
          created_at: string
          email: string
          id: string
          invite_code: string | null
          name: string | null
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          email: string
          id?: string
          invite_code?: string | null
          name?: string | null
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          email?: string
          id?: string
          invite_code?: string | null
          name?: string | null
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      wilderness_areas: {
        Row: {
          admin_unit: string | null
          area_acres: number | null
          boundary: unknown
          camping_allowed: boolean | null
          created_at: string | null
          data_source_run_id: string | null
          designating_authority: string | null
          designation_act: string | null
          designation_date: string | null
          designation_type: Database["public"]["Enums"]["designation_type"]
          external_id: string | null
          fire_restrictions: string | null
          group_size_limit: number | null
          id: string
          is_active: boolean | null
          managing_agency: string | null
          name: string
          no_mechanized_travel: boolean | null
          no_motorized_travel: boolean | null
          permit_required: boolean | null
          permit_url: string | null
          source_type: string | null
          source_url: string | null
          special_rules: string | null
          updated_at: string | null
        }
        Insert: {
          admin_unit?: string | null
          area_acres?: number | null
          boundary: unknown
          camping_allowed?: boolean | null
          created_at?: string | null
          data_source_run_id?: string | null
          designating_authority?: string | null
          designation_act?: string | null
          designation_date?: string | null
          designation_type?: Database["public"]["Enums"]["designation_type"]
          external_id?: string | null
          fire_restrictions?: string | null
          group_size_limit?: number | null
          id?: string
          is_active?: boolean | null
          managing_agency?: string | null
          name: string
          no_mechanized_travel?: boolean | null
          no_motorized_travel?: boolean | null
          permit_required?: boolean | null
          permit_url?: string | null
          source_type?: string | null
          source_url?: string | null
          special_rules?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_unit?: string | null
          area_acres?: number | null
          boundary?: unknown
          camping_allowed?: boolean | null
          created_at?: string | null
          data_source_run_id?: string | null
          designating_authority?: string | null
          designation_act?: string | null
          designation_date?: string | null
          designation_type?: Database["public"]["Enums"]["designation_type"]
          external_id?: string | null
          fire_restrictions?: string | null
          group_size_limit?: number | null
          id?: string
          is_active?: boolean | null
          managing_agency?: string | null
          name?: string
          no_mechanized_travel?: boolean | null
          no_motorized_travel?: boolean | null
          permit_required?: boolean | null
          permit_url?: string | null
          source_type?: string | null
          source_url?: string | null
          special_rules?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      designations: {
        Row: {
          area_acres: number | null
          boundary: unknown
          created_at: string | null
          designation_date: string | null
          designation_type: string | null
          id: string | null
          is_active: boolean | null
          managing_agency: string | null
          name: string | null
          source_type: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      regions_with_metrics: {
        Row: {
          area_sq_miles: number | null
          bbox_east: number | null
          bbox_north: number | null
          bbox_south: number | null
          bbox_west: number | null
          best_road_surface:
            | Database["public"]["Enums"]["road_surface_type"]
            | null
          bounds: unknown
          campsite_count: number | null
          campsite_density_score: number | null
          cell_coverage_pct: number | null
          center: unknown
          created_at: string | null
          created_by_run_id: string | null
          current_snow_cover_pct: number | null
          description: string | null
          dispersed_camping_allowed: boolean | null
          elevation_avg_ft: number | null
          elevation_max_ft: number | null
          elevation_min_ft: number | null
          h3_index: string | null
          has_cell_coverage: boolean | null
          id: string | null
          is_active: boolean | null
          is_curated: boolean | null
          last_updated_by_run_id: string | null
          name: string | null
          parent_region_id: string | null
          popularity_percentile: number | null
          popularity_score: number | null
          primary_biome: Database["public"]["Enums"]["biome_type"] | null
          public_land_pct: number | null
          public_land_score: number | null
          quality_score: number | null
          region_type: string | null
          remoteness_score: number | null
          seasonal_access_score: number | null
          secondary_biomes: Database["public"]["Enums"]["biome_type"][] | null
          slug: string | null
          tagline: string | null
          trail_count: number | null
          trail_density_score: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "regions_created_by_run_id_fkey"
            columns: ["created_by_run_id"]
            isOneToOne: false
            referencedRelation: "data_source_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regions_last_updated_by_run_id_fkey"
            columns: ["last_updated_by_run_id"]
            isOneToOne: false
            referencedRelation: "data_source_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regions_parent_region_id_fkey"
            columns: ["parent_region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regions_parent_region_id_fkey"
            columns: ["parent_region_id"]
            isOneToOne: false
            referencedRelation: "regions_with_metrics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_to_waitlist: { Args: { p_email: string }; Returns: Json }
      approve_waitlist_entry: {
        Args: { waitlist_email: string }
        Returns: string
      }
      backfill_road_accessibility: { Args: never; Returns: number }
      backfill_road_public_lands: {
        Args: {
          p_east?: number
          p_north?: number
          p_south?: number
          p_west?: number
        }
        Returns: number
      }
      bytea_to_text: { Args: { data: string }; Returns: string }
      can_edit_trip: { Args: { trip_id: string }; Returns: boolean }
      check_invite_code: {
        Args: { code: string }
        Returns: {
          email: string
          valid: boolean
        }[]
      }
      compute_is_established_campground: {
        Args: { p_name: string; p_osm_tags: Json }
        Returns: boolean
      }
      derive_all_dead_ends_batch: {
        Args: {
          p_batch_size?: number
          p_east: number
          p_north: number
          p_south: number
          p_west: number
        }
        Returns: number
      }
      derive_all_osm_dead_ends: {
        Args: {
          p_batch_size?: number
          p_east: number
          p_north: number
          p_south: number
          p_west: number
        }
        Returns: number
      }
      derive_blm_dead_ends_simple: {
        Args: { p_batch_size?: number }
        Returns: number
      }
      derive_blm_spots: {
        Args: {
          p_east: number
          p_north: number
          p_south: number
          p_west: number
        }
        Returns: number
      }
      derive_dead_end_spots: {
        Args: {
          p_east: number
          p_north: number
          p_south: number
          p_west: number
        }
        Returns: number
      }
      derive_dead_ends_matching_client: {
        Args: {
          p_batch_size?: number
          p_east: number
          p_north: number
          p_south: number
          p_west: number
        }
        Returns: number
      }
      derive_spots_batch: {
        Args: {
          p_batch_size?: number
          p_east: number
          p_north: number
          p_south: number
          p_west: number
        }
        Returns: number
      }
      derive_spots_from_linked_roads: {
        Args: {
          p_east: number
          p_north: number
          p_south: number
          p_west: number
        }
        Returns: number
      }
      find_covering_region: {
        Args: {
          p_east: number
          p_north: number
          p_south: number
          p_west: number
        }
        Returns: {
          analysed_at: string
          id: string
          spot_count: number
        }[]
      }
      generate_invite_code: { Args: never; Returns: string }
      get_campgrounds_nearby: {
        Args: { p_lat: number; p_lng: number; p_radius_miles?: number }
        Returns: {
          agency_name: string
          distance_miles: number
          id: string
          is_reservable: boolean
          lat: number
          lng: number
          name: string
          recreation_gov_url: string
        }[]
      }
      get_dispersed_spots: {
        Args: {
          p_include_derived?: boolean
          p_lat: number
          p_limit?: number
          p_lng: number
          p_min_confidence?: number
          p_radius_miles?: number
          p_vehicle_access?: string
        }
        Returns: {
          confidence_score: number
          derivation_reasons: string[]
          distance_miles: number
          id: string
          is_established_campground: boolean
          is_on_public_land: boolean
          is_road_accessible: boolean
          land_protect_class: string
          land_protection_title: string
          land_unit_name: string
          lat: number
          lng: number
          managing_agency: string
          name: string
          osm_tags: Json
          road_name: string
          spot_type: Database["public"]["Enums"]["spot_type"]
          status: Database["public"]["Enums"]["spot_status"]
          vehicle_access: Database["public"]["Enums"]["vehicle_access_type"]
        }[]
      }
      get_diversity_multiplier: {
        Args: {
          p_biome: Database["public"]["Enums"]["biome_type"]
          p_recent_biomes: Database["public"]["Enums"]["biome_type"][]
        }
        Returns: number
      }
      get_public_lands_names_nearby: {
        Args: { p_lat: number; p_lng: number; p_radius_miles?: number }
        Returns: {
          dispersed_camping_allowed: boolean
          id: string
          managing_agency: string
          name: string
        }[]
      }
      get_public_lands_nearby: {
        Args: {
          p_include_geometry?: boolean
          p_lat: number
          p_lng: number
          p_radius_miles?: number
        }
        Returns: {
          boundary_simplified: unknown
          dispersed_camping_allowed: boolean
          id: string
          land_type: string
          managing_agency: string
          name: string
        }[]
      }
      get_regions_within_distance: {
        Args: {
          max_distance_miles: number
          min_distance_miles?: number
          user_lat: number
          user_lng: number
        }
        Returns: {
          distance_miles: number
          region_id: string
        }[]
      }
      get_regulations_at_location: {
        Args: { p_date?: string; p_location: unknown }
        Returns: {
          description: string
          issuing_agency: string
          regulation_id: string
          regulation_type: string
          restriction_level: string
          title: string
        }[]
      }
      get_road_segments: {
        Args: {
          p_lat: number
          p_limit?: number
          p_lng: number
          p_radius_miles?: number
          p_source_type?: string
        }
        Returns: {
          access: string
          coordinates: Json
          distance_miles: number
          external_id: string
          four_wd_only: boolean
          highway: string
          id: string
          managing_agency: string
          mvum_tags: Json
          name: string
          osm_tags: Json
          seasonal_closure: string
          source_type: string
          surface_type: string
          tracktype: string
          vehicle_access: string
        }[]
      }
      get_roads_near_point: {
        Args: {
          p_lat: number
          p_limit?: number
          p_lng: number
          p_radius_miles?: number
        }
        Returns: {
          access: string
          coordinates: Json
          distance_miles: number
          four_wd_only: boolean
          highway: string
          id: string
          managing_agency: string
          name: string
          source_type: Database["public"]["Enums"]["road_source_type"]
          surface_type: string
          tracktype: string
          vehicle_access: Database["public"]["Enums"]["vehicle_access_type"]
        }[]
      }
      get_snowline_ft: {
        Args: { lat: number; month_num: number }
        Returns: number
      }
      get_trip_members: {
        Args: { p_trip_id: string }
        Returns: {
          email: string
          name: string
          permission: string
          user_id: string
        }[]
      }
      get_trip_preview_by_token: {
        Args: { share_token: string }
        Returns: Json
      }
      get_user_recent_biomes: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: Database["public"]["Enums"]["biome_type"][]
      }
      http: {
        Args: { request: Database["public"]["CompositeTypes"]["http_request"] }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "http_request"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_delete:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_get:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_head: {
        Args: { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_header: {
        Args: { field: string; value: string }
        Returns: Database["public"]["CompositeTypes"]["http_header"]
        SetofOptions: {
          from: "*"
          to: "http_header"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_list_curlopt: {
        Args: never
        Returns: {
          curlopt: string
          value: string
        }[]
      }
      http_patch: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_post:
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_put: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_reset_curlopt: { Args: never; Returns: boolean }
      http_set_curlopt: {
        Args: { curlopt: string; value: string }
        Returns: boolean
      }
      import_osm_camp_site: {
        Args: {
          p_is_way_or_area?: boolean
          p_lat: number
          p_lng: number
          p_name: string
          p_osm_id: number
          p_osm_tags: Json
        }
        Returns: string
      }
      import_private_road_points: {
        Args: {
          p_east: number
          p_north: number
          p_points: Json
          p_south: number
          p_west: number
        }
        Returns: number
      }
      insert_campground: {
        Args: {
          p_agency_name: string
          p_description: string
          p_facility_type: string
          p_forest_name: string
          p_is_reservable: boolean
          p_lat: number
          p_lng: number
          p_name: string
          p_recreation_gov_url: string
          p_ridb_facility_id: string
        }
        Returns: string
      }
      insert_osm_camp_site: {
        Args: {
          p_lat: number
          p_lng: number
          p_name: string
          p_osm_id: number
          p_reasons: string[]
          p_score: number
          p_vehicle_access?: string
        }
        Returns: string
      }
      insert_public_land: {
        Args: {
          p_area_acres: number
          p_boundary_wkt: string
          p_dispersed_camping_allowed?: boolean
          p_external_id: string
          p_land_type: string
          p_managing_agency: string
          p_name: string
          p_source_type: string
        }
        Returns: string
      }
      insert_public_land_simple: {
        Args: {
          p_area_acres: number
          p_boundary_wkt: string
          p_dispersed_camping_allowed?: boolean
          p_external_id: string
          p_land_type: string
          p_managing_agency: string
          p_name: string
          p_source_type: string
        }
        Returns: string
      }
      insert_region_with_geometry: {
        Args: {
          p_area_sq_miles: number
          p_bbox_east: number
          p_bbox_north: number
          p_bbox_south: number
          p_bbox_west: number
          p_center_lat: number
          p_center_lng: number
          p_description: string
          p_name: string
          p_primary_biome: string
          p_run_id: string
          p_slug: string
        }
        Returns: string
      }
      insert_road_segment: {
        Args: {
          p_external_id: string
          p_geometry_wkt: string
          p_name: string
          p_seasonal_closure?: string
          p_source_type: string
          p_surface_type: string
          p_vehicle_access: string
        }
        Returns: string
      }
      insert_road_segment_simple:
        | {
            Args: {
              p_access?: string
              p_external_id: string
              p_four_wd_only?: boolean
              p_geometry_wkt: string
              p_highway?: string
              p_name: string
              p_seasonal_closure: string
              p_source_type: Database["public"]["Enums"]["road_source_type"]
              p_surface_type: string
              p_tracktype?: string
              p_vehicle_access: Database["public"]["Enums"]["vehicle_access_type"]
            }
            Returns: string
          }
        | {
            Args: {
              p_external_id: string
              p_geometry_wkt: string
              p_name: string
              p_seasonal_closure?: string
              p_source_type: string
              p_surface_type: string
              p_vehicle_access: string
            }
            Returns: string
          }
      is_in_exclusion_zone: {
        Args: { p_buffer_meters?: number; p_location: unknown }
        Returns: {
          is_excluded: boolean
          reason: string
          zone_name: string
          zone_type: string
        }[]
      }
      is_in_wilderness: {
        Args: { p_location: unknown }
        Returns: {
          is_wilderness: boolean
          managing_agency: string
          permit_required: boolean
          wilderness_name: string
        }[]
      }
      is_near_private_road: {
        Args: { p_location: unknown; p_threshold_meters?: number }
        Returns: boolean
      }
      is_point_near_road: {
        Args: { p_lat: number; p_lng: number; p_threshold_miles?: number }
        Returns: boolean
      }
      is_trip_collaborator: { Args: { trip_id: string }; Returns: boolean }
      is_trip_owner: { Args: { trip_id: string }; Returns: boolean }
      join_trip_by_share_link: { Args: { share_token: string }; Returns: Json }
      run_weekly_sync: {
        Args: never
        Returns: {
          campgrounds_result: Json
          public_lands_result: Json
          region: string
        }[]
      }
      sync_campgrounds: {
        Args: {
          p_region: Database["public"]["CompositeTypes"]["region_definition"]
        }
        Returns: Json
      }
      sync_public_lands: {
        Args: {
          p_region: Database["public"]["CompositeTypes"]["region_definition"]
        }
        Returns: Json
      }
      text_to_bytea: { Args: { data: string }; Returns: string }
      urlencode:
        | { Args: { data: Json }; Returns: string }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      use_invite_code: {
        Args: { code: string; user_id: string }
        Returns: boolean
      }
      validate_geometry_srid_4326: { Args: { geom: unknown }; Returns: boolean }
      validate_geometry_valid: { Args: { geom: unknown }; Returns: boolean }
    }
    Enums: {
      biome_type: "desert" | "alpine" | "forest" | "coastal" | "grassland"
      data_source_type:
        | "pad_us"
        | "osm"
        | "usfs"
        | "blm"
        | "nps"
        | "ridb"
        | "noaa"
        | "manual"
        | "derived"
      designation_type:
        | "wilderness"
        | "wilderness_study_area"
        | "national_monument"
        | "national_conservation_area"
        | "wild_scenic_river"
        | "critical_habitat"
        | "inventoried_roadless"
        | "research_natural_area"
        | "area_of_critical_environmental_concern"
        | "special_recreation_management_area"
        | "other"
      exclusion_type:
        | "private_property"
        | "military"
        | "mining_active"
        | "mining_abandoned"
        | "industrial"
        | "hazardous_materials"
        | "wildlife_closure"
        | "cultural_site"
        | "water_protection"
        | "urban_boundary"
        | "airport"
        | "railroad"
        | "dam_spillway"
        | "firing_range"
        | "other"
      land_source_type: "pad_us" | "blm_sma" | "usfs" | "osm" | "state"
      regulation_status:
        | "active"
        | "seasonal"
        | "temporary"
        | "pending"
        | "expired"
      regulation_type:
        | "dispersed_camping"
        | "fire_restriction"
        | "vehicle_restriction"
        | "stay_limit"
        | "permit_required"
        | "seasonal_closure"
        | "wilderness_rules"
        | "noise_restriction"
        | "group_size_limit"
        | "other"
      road_source_type: "mvum" | "blm" | "osm"
      road_surface_type:
        | "paved"
        | "gravel"
        | "dirt"
        | "4wd_only"
        | "no_vehicle_access"
      run_status: "running" | "completed" | "failed" | "partial"
      spot_status: "derived" | "admin_verified" | "user_confirmed" | "rejected"
      spot_type: "dead_end" | "camp_site" | "pullout" | "intersection"
      vehicle_access_type:
        | "passenger"
        | "high_clearance"
        | "4wd"
        | "atv_only"
        | "closed"
    }
    CompositeTypes: {
      http_header: {
        field: string | null
        value: string | null
      }
      http_request: {
        method: unknown
        uri: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content_type: string | null
        content: string | null
      }
      http_response: {
        status: number | null
        content_type: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content: string | null
      }
      region_definition: {
        name: string | null
        south: number | null
        north: number | null
        west: number | null
        east: number | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      biome_type: ["desert", "alpine", "forest", "coastal", "grassland"],
      data_source_type: [
        "pad_us",
        "osm",
        "usfs",
        "blm",
        "nps",
        "ridb",
        "noaa",
        "manual",
        "derived",
      ],
      designation_type: [
        "wilderness",
        "wilderness_study_area",
        "national_monument",
        "national_conservation_area",
        "wild_scenic_river",
        "critical_habitat",
        "inventoried_roadless",
        "research_natural_area",
        "area_of_critical_environmental_concern",
        "special_recreation_management_area",
        "other",
      ],
      exclusion_type: [
        "private_property",
        "military",
        "mining_active",
        "mining_abandoned",
        "industrial",
        "hazardous_materials",
        "wildlife_closure",
        "cultural_site",
        "water_protection",
        "urban_boundary",
        "airport",
        "railroad",
        "dam_spillway",
        "firing_range",
        "other",
      ],
      land_source_type: ["pad_us", "blm_sma", "usfs", "osm", "state"],
      regulation_status: [
        "active",
        "seasonal",
        "temporary",
        "pending",
        "expired",
      ],
      regulation_type: [
        "dispersed_camping",
        "fire_restriction",
        "vehicle_restriction",
        "stay_limit",
        "permit_required",
        "seasonal_closure",
        "wilderness_rules",
        "noise_restriction",
        "group_size_limit",
        "other",
      ],
      road_source_type: ["mvum", "blm", "osm"],
      road_surface_type: [
        "paved",
        "gravel",
        "dirt",
        "4wd_only",
        "no_vehicle_access",
      ],
      run_status: ["running", "completed", "failed", "partial"],
      spot_status: ["derived", "admin_verified", "user_confirmed", "rejected"],
      spot_type: ["dead_end", "camp_site", "pullout", "intersection"],
      vehicle_access_type: [
        "passenger",
        "high_clearance",
        "4wd",
        "atv_only",
        "closed",
      ],
    },
  },
} as const
