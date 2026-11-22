export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      branches: Table<{
        id: string;
        code: string;
        name: string;
        city: string;
        address: string;
        active: boolean;
        created_at: string;
      }>;
      profiles: Table<{
        id: string;
        email: string;
        employee_id: string | null;
        must_change_password: boolean;
        username: string | null;
        full_name: string;
        role: 'owner' | 'staff';
        branch_id: string | null;
        active: boolean;
        created_at: string;
        updated_at: string;
      }>;
      ingredient_categories: Table<{
        id: string;
        name: string;
        created_at: string;
      }>;
      ingredients: Table<{
        id: string;
        category_id: string;
        name: string;
        unit: string;
        quantity_precision: number;
        expiration_tracking: boolean;
        active: boolean;
        automatic_consumption_enabled: boolean;
        created_at: string;
        updated_at: string;
      }>;
      branch_inventory: Table<{
        id: string;
        branch_id: string;
        ingredient_id: string;
        quantity: number;
        minimum_stock: number;
        updated_at: string;
        inventory_revision: number;
      }>;
      ingredient_batches: Table<{
        id: string;
        branch_id: string;
        ingredient_id: string;
        batch_reference: string;
        received_date: string;
        expiration_date: string | null;
        quantity_received: number;
        quantity_remaining: number;
        status: 'active' | 'quarantined' | 'damaged' | 'reserved';
        created_at: string;
      }>;
      ingredient_replenishment_settings: Table<{
        ingredient_id: string;
        lead_time_days: number;
        service_level_z: number;
        window_days: number;
        min_history_days: number;
        shelf_life_days: number | null;
        updated_at: string;
        updated_by: string | null;
      }>;
      inventory_reorder_points: Table<{
        branch_id: string;
        ingredient_id: string;
        method: 'DYNAMIC_ROP' | 'OWNER_MINIMUM';
        method_reason: 'COLD_START' | 'IN_HOUSE_ITEM' | 'NOT_CONFIGURED' | null;
        threshold_source: 'DYNAMIC_ROP' | 'OWNER_MINIMUM';
        window_days: number | null;
        operating_days_used: number;
        average_daily_usage: number | null;
        usage_stddev: number | null;
        lead_time_days: number | null;
        service_level_z: number | null;
        shelf_life_days: number | null;
        safety_stock: number;
        reorder_point: number | null;
        owner_minimum: number;
        effective_rop: number;
        config_inconsistent: boolean;
        business_date: string;
        computed_at: string;
        algorithm_version: string;
      }>;
      inventory_stock_alerts: Table<{
        id: string;
        branch_id: string;
        ingredient_id: string;
        severity: 'LOW_STOCK' | 'CRITICAL';
        status: 'open' | 'resolved';
        expected_stock: number;
        effective_rop: number;
        safety_stock: number;
        threshold_source: 'DYNAMIC_ROP' | 'OWNER_MINIMUM';
        method_reason: string | null;
        opened_at: string;
        updated_at: string;
        resolved_at: string | null;
      }>;
      inventory_fefo_certificates: Table<{
        movement_id: string;
        branch_id: string;
        ingredient_id: string;
        requested_quantity: number;
        allocated_quantity: number;
        shortfall_quantity: number;
        status: 'COMPLETED' | 'PARTIAL' | 'INSUFFICIENT_STOCK';
        included_expired: boolean;
        allocations: Json;
        allocated_at: string;
        algorithm_version: string;
      }>;
      inventory_movements: Table<{
        id: string;
        reference: string;
        branch_id: string;
        ingredient_id: string;
        actor_id: string;
        type: Database['public']['Enums']['inventory_transaction_type'];
        quantity: number;
        unit: string;
        movement: number;
        before_quantity: number;
        after_quantity: number;
        transaction_date: string;
        reason: string;
        notes: string;
        batch_id: string | null;
        request_id: string | null;
        request_line_index: number | null;
        request_payload_hash: string | null;
        /** Set only for `sales_consumption` rows: the sale that consumed the stock. */
        sale_id: string | null;
        /** Set only for `entry_reversal` rows: the movement this one reverses. */
        reverses_movement_id?: string | null;
        created_at: string;
      }>;
      daily_stock_checks: Table<{
        id: string;
        reference: string;
        branch_id: string;
        submitted_by: string;
        check_date: string;
        remarks: string;
        status: 'submitted' | 'pending_owner_review';
        created_at: string;
      }>;
      daily_stock_count_lines: Table<{
        id: string;
        daily_stock_check_id: string;
        ingredient_id: string;
        recorded_quantity: number;
        physical_quantity: number;
        difference: number;
        unit: string;
        created_at: string;
        inventory_revision: number | null;
      }>;
      daily_stock_check_drafts: Table<{
        id: string;
        draft_id: string;
        branch_id: string;
        staff_id: string;
        check_date: string;
        remarks: string;
        verified: boolean;
        lines: Json;
        created_at: string;
        updated_at: string;
      }>;
      products: Table<{
        id: string;
        product_name: string;
        description: string;
        price: number;
        piece_count: number | null;
        is_available: boolean;
        category: string;
        internal_code: string | null;
        display_name: string | null;
        recipe_status: 'complete' | 'incomplete' | 'pending_confirmation';
        created_at: string;
        updated_at: string;
      }>;
      units_of_measure: Table<{
        code: string;
        name: string;
        dimension: string;
      }>;
      unit_conversions: Table<{
        from_unit: string;
        to_unit: string;
        factor: number;
      }>;
      ingredient_package_sizes: Table<{
        ingredient_id: string;
        package_quantity: number;
        package_unit: string;
        package_label: string;
      }>;
      product_variants: Table<{
        id: string;
        product_id: string;
        variant_code: string;
        size_label: string;
        piece_count: number;
        price: number;
        max_order_quantity: number | null;
        active: boolean;
        is_available: boolean;
        created_at: string;
        updated_at: string;
      }>;
      branch_product_visibility: Table<{
        branch_id: string;
        product_variant_id: string;
        is_visible: boolean;
        created_at: string;
      }>;
      menu_addons: Table<{
        id: string;
        addon_code: string;
        addon_name: string;
        price: number;
        active: boolean;
        created_at: string;
        updated_at: string;
      }>;
      batter_preparation_batches: Table<{
        batch_reference: string;
        branch_id: string;
        prepared_by: string;
        bottle_count: number;
        bottle_volume_ml: number;
        preparation_date: string;
        prepared_quantity: number;
        prepared_unit: string;
        estimated_yield_pieces: number;
        expected_min_pieces: number;
        expected_max_pieces: number;
        created_at: string;
      }>;
      recipes: Table<{
        id: string;
        product_id: string;
        ingredient_id: string;
        quantity_required: number;
        unit_of_measure: string;
        automatic_consumption_enabled: boolean;
      }>;
      sales: Table<{
        id: string;
        transaction_reference: string;
        branch_id: string;
        staff_id: string;
        total_amount: number;
        payment_method: string;
        status: 'pending' | 'completed' | 'cancelled' | 'voided';
        inventory_processing_status: 'pending' | 'processing' | 'completed' | 'failed';
        inventory_processing_error: string | null;
        inventory_processed_at: string | null;
        /** ST-05 c5: cash payments only (migration 202611220006). */
        cash_received?: number | null;
        change_amount?: number | null;
        /** ST-05 c2: employee name saved with the sale. */
        served_by_name?: string | null;
        created_at: string;
      }>;
      sale_void_requests: Table<{
        id: string;
        reference: string;
        client_request_id: string;
        sale_id: string;
        branch_id: string;
        requested_by: string;
        reason: string;
        status: 'pending' | 'approved' | 'rejected';
        requested_at: string;
        decided_by: string | null;
        decided_at: string | null;
        decision_reason: string | null;
      }>;
      inventory_entry_reversal_requests: Table<{
        id: string;
        reference: string;
        client_request_id: string;
        branch_id: string;
        entry_kind: 'movement' | 'batter_batch';
        entry_key: string;
        movement_id: string | null;
        batch_reference: string | null;
        entry_type: 'stock_in' | 'batter_preparation' | 'waste' | 'spillage' | 'spoilage';
        entry_reference: string;
        item_name: string;
        quantity: number;
        unit: string;
        entry_recorded_at: string;
        requested_by: string;
        reason: string;
        status: 'pending' | 'approved' | 'rejected';
        requested_at: string;
        decided_by: string | null;
        decided_at: string | null;
        decision_reason: string | null;
      }>;
      daily_closings: Table<{
        id: string;
        reference: string;
        client_request_id: string;
        branch_id: string;
        business_date: string;
        opening_float: number;
        closing_cash_count: number;
        recorded_cash_sales: number;
        voided_cash_sales: number;
        expected_cash: number;
        over_short: number;
        cash_transaction_count: number;
        recorded_by: string;
        recorded_at: string;
      }>;
      inventory_count_rejections: Table<{
        id: string;
        daily_stock_count_line_id: string;
        daily_stock_check_id: string;
        branch_id: string;
        ingredient_id: string;
        rejected_by: string;
        reason: string;
        rejected_at: string;
      }>;
      sale_items: Table<{
        id: string;
        sale_id: string;
        product_id: string;
        product_variant_id: string | null;
        quantity: number;
        unit_price: number;
        subtotal: number;
      }>;
      sale_addons: Table<{
        id: string;
        sale_id: string;
        addon_id: string;
        quantity: number;
        unit_price: number;
        subtotal: number;
      }>;
      shared_recipes: Table<{
        id: string;
        recipe_code: string;
        name: string;
        estimated_yield_pieces: number;
        prepared_quantity: number;
        prepared_unit: string;
        active: boolean;
        automatic_consumption_enabled: boolean;
        version: number;
        created_at: string;
        updated_at: string;
      }>;
      shared_recipe_ingredients: Table<{
        shared_recipe_id: string;
        ingredient_id: string;
        quantity_required: number;
        unit_of_measure: string;
        automatic_consumption_enabled: boolean;
      }>;
      shared_recipe_products: Table<{
        shared_recipe_id: string;
        product_id: string;
        active: boolean;
      }>;
      sale_consumption_snapshots: Table<{
        id: string;
        sale_id: string;
        ingredient_id: string;
        quantity_consumed: number;
        unit_of_measure: string;
        applicable_pieces: number;
        recipe_type: 'shared' | 'product';
        recipe_id: string | null;
        recipe_version: number | null;
        recipe_quantity_required: number | null;
        estimated_yield_pieces: number | null;
        created_at: string;
      }>;
      shared_recipe_versions: Table<{
        shared_recipe_id: string;
        version: number;
        name: string;
        estimated_yield_pieces: number;
        prepared_quantity: number;
        prepared_unit: string;
        active: boolean;
        automatic_consumption_enabled: boolean;
        created_at: string;
      }>;
      shared_recipe_version_ingredients: Table<{
        shared_recipe_id: string;
        version: number;
        ingredient_id: string;
        quantity_required: number;
        unit_of_measure: string;
        automatic_consumption_enabled: boolean;
      }>;
      sale_inventory_processing: Table<{
        sale_id: string;
        status: 'pending' | 'processing' | 'completed' | 'failed';
        failure_reason: string | null;
        attempt_count: number;
        processed_at: string | null;
        updated_at: string;
      }>;
      audit_logs: Table<{
        id: string;
        user_id: string | null;
        branch_id: string | null;
        action: string;
        description: string;
        created_at: string;
        chain_scope: string;
        sequence_number: number;
        previous_hash: string;
        event_hash: string;
      }>;
      audit_chain_checkpoints: Table<{
        id: string;
        chain_scope: string;
        sequence_number: number;
        event_hash: string;
        created_at: string;
        created_by: string | null;
      }>;
      owner_inventory_settings: Table<{
        id: boolean;
        near_expiration_days: number;
        lot_warning_hours: number;
        lot_critical_hours: number;
        updated_at: string;
      }>;
      inventory_discrepancy_adjustments: Table<{
        id: string;
        daily_stock_count_line_id: string;
        daily_stock_check_id: string;
        branch_id: string;
        ingredient_id: string;
        recorded_quantity: number;
        physical_quantity: number;
        difference: number;
        approved_by: string;
        reason: string;
        approved_at: string;
        inventory_movement_id: string;
      }>;
      inventory_count_correction_requests: Table<{
        id: string;
        request_id: string;
        daily_stock_count_line_id: string;
        daily_stock_check_id: string;
        branch_id: string;
        ingredient_id: string;
        requested_by: string;
        corrected_actual_quantity: number;
        reason: string;
        status: 'pending' | 'approved' | 'rejected';
        decided_by: string | null;
        decision_reason: string | null;
        decided_at: string | null;
        created_at: string;
      }>;
      inventory_count_validations: Table<{
        id: string;
        daily_stock_count_line_id: string;
        correction_request_id: string | null;
        branch_id: string;
        ingredient_id: string;
        expected_quantity: number;
        original_actual_quantity: number;
        corrected_actual_quantity: number;
        outcome: 'adjusted' | 'no_change';
        validated_by: string;
        reason: string;
        inventory_movement_id: string | null;
        validated_at: string;
      }>;
      business_day_settings: Table<{
        business_date: string;
        opening_time: string;
        normal_closing_time: string;
        extended_closing_time: string;
        extended_closing_enabled: boolean;
        timezone: string;
        updated_by: string | null;
        updated_at: string;
      }>;
      business_day_sessions: Table<{
        session_id: string;
        user_id: string;
        business_date: string;
        created_at: string;
      }>;
    };
    Views: {
      inventory: {
        Row: Database['public']['Tables']['branch_inventory']['Row'];
        Relationships: [];
      };
      inventory_transactions: {
        Row: Database['public']['Tables']['inventory_movements']['Row'];
        Relationships: [];
      };
    };
    Functions: {
      can_access_branch: { Args: { target_branch: string }; Returns: boolean };
      verify_audit_chain: {
        Args: {
          p_chain_scope?: string | null;
          p_from_sequence?: number;
          p_from_hash?: string | null;
          p_to_sequence?: number | null;
          p_from_last_checkpoint?: boolean;
        };
        Returns: Json;
      };
      create_audit_checkpoint: {
        Args: Record<PropertyKey, never>;
        Returns: Database['public']['Tables']['audit_chain_checkpoints']['Row'][];
      };
      refresh_reorder_points: {
        Args: { p_branch_id?: string | null };
        Returns: Database['public']['Tables']['inventory_reorder_points']['Row'][];
      };
      is_active_owner: { Args: Record<PropertyKey, never>; Returns: boolean };
      authorize_business_session: { Args: Record<PropertyKey, never>; Returns: Json };
      business_session_status: { Args: Record<PropertyKey, never>; Returns: Json };
      set_business_day_settings: {
        Args: {
          p_business_date: string;
          p_opening_time: string;
          p_normal_closing_time: string;
          p_extended_closing_time: string;
          p_extended_closing_enabled: boolean;
        };
        Returns: Database['public']['Tables']['business_day_settings']['Row'];
      };
      record_inventory_transactions: {
        Args: { p_branch_id: string; p_transactions: Json };
        Returns: Database['public']['Tables']['inventory_movements']['Row'][];
      };
      record_inventory_transactions_idempotent: {
        Args: { p_branch_id: string; p_request_id: string; p_transactions: Json };
        Returns: Database['public']['Tables']['inventory_movements']['Row'][];
      };
      submit_daily_stock_check: {
        Args: { p_branch_id: string; p_request_id: string; p_check_date: string; p_remarks: string; p_lines: Json };
        Returns: Json;
      };
      save_daily_stock_check_draft: {
        Args: {
          p_draft_id: string;
          p_branch_id: string;
          p_check_date: string;
          p_remarks: string;
          p_verified: boolean;
          p_lines: Json;
        };
        Returns: Database['public']['Tables']['daily_stock_check_drafts']['Row'];
      };
      delete_daily_stock_check_draft: {
        Args: { p_draft_id: string; p_branch_id: string };
        Returns: boolean;
      };
      authorize_inventory_discrepancy_adjustment: {
        Args: { p_count_line_id: string; p_reason: string };
        Returns: Database['public']['Tables']['inventory_discrepancy_adjustments']['Row'];
      };
      request_inventory_count_correction: {
        Args: {
          p_count_line_id: string;
          p_request_id: string;
          p_corrected_actual_quantity: number;
          p_reason: string;
        };
        Returns: Database['public']['Tables']['inventory_count_correction_requests']['Row'];
      };
      decide_inventory_count_correction: {
        Args: { p_request_id: string; p_decision: string; p_reason: string };
        Returns: Database['public']['Tables']['inventory_count_correction_requests']['Row'];
      };
      validate_inventory_count_correction: {
        Args: { p_request_id: string; p_reason: string };
        Returns: Database['public']['Tables']['inventory_count_validations']['Row'];
      };
      reject_submitted_inventory_count: {
        Args: { p_count_line_id: string; p_reason: string };
        Returns: Database['public']['Tables']['inventory_count_rejections']['Row'];
      };
      validate_submitted_inventory_count: {
        Args: { p_count_line_id: string; p_reason: string };
        Returns: Database['public']['Tables']['inventory_count_validations']['Row'];
      };
      prepare_batter_batch: {
        Args: {
          p_branch_id: string;
          p_batch_reference: string | null;
          p_prepared_quantity?: number;
          p_preparation_date?: string | null;
        };
        Returns: Database['public']['Tables']['batter_preparation_batches']['Row'];
      };
      next_batter_batch_reference: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      submit_sale: {
        Args: {
          p_transaction_reference: string;
          p_branch_id: string;
          p_payment_method: string;
          p_total_amount: number;
          p_items: Json;
          p_addons?: Json;
        };
        Returns: Database['public']['Tables']['sales']['Row'];
      };
      submit_sale_with_payment: {
        Args: {
          p_transaction_reference: string;
          p_branch_id: string;
          p_payment_method: string;
          p_total_amount: number;
          p_items: Json;
          p_addons?: Json;
          p_cash_received?: number | null;
        };
        Returns: Database['public']['Tables']['sales']['Row'];
      };
      inspect_sale_reconciliation: {
        Args: { p_transaction_reference: string };
        Returns: Json;
      };
      process_sale_inventory: {
        Args: { p_sale_id: string };
        Returns: Json;
      };
      request_sale_void: {
        Args: { p_sale_id: string; p_reason: string; p_client_request_id: string };
        Returns: Database['public']['Tables']['sale_void_requests']['Row'];
      };
      request_inventory_entry_reversal: {
        Args: { p_movement_id: string; p_reason: string; p_client_request_id: string };
        Returns: Database['public']['Tables']['inventory_entry_reversal_requests']['Row'];
      };
      decide_inventory_entry_reversal: {
        Args: { p_request_id: string; p_decision: 'approve' | 'reject'; p_reason?: string | null };
        Returns: Database['public']['Tables']['inventory_entry_reversal_requests']['Row'];
      };
      record_daily_closing: {
        Args: { p_branch_id: string; p_opening_float: number; p_closing_cash_count: number; p_client_request_id: string };
        Returns: Database['public']['Tables']['daily_closings']['Row'];
      };
      decide_sale_void: {
        Args: { p_request_id: string; p_decision: 'approve' | 'reject'; p_reason?: string | null };
        Returns: Database['public']['Tables']['sale_void_requests']['Row'];
      };
    };
    Enums: {
      app_role: 'owner' | 'staff';
      inventory_transaction_type: 'stock_in' | 'stock_out' | 'usage' | 'waste' | 'spoilage' | 'adjustment' | 'sales_consumption' | 'transfer_in' | 'transfer_out' | 'void_reversal' | 'entry_reversal';
    };
    CompositeTypes: Record<string, never>;
  };
};
