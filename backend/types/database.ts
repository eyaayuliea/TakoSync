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
        created_at: string;
      }>;
      inventory_movements: Table<{
        id: string;
        reference: string;
        branch_id: string;
        ingredient_id: string;
        actor_id: string;
        type: 'stock_in' | 'stock_out' | 'usage' | 'waste' | 'spoilage' | 'adjustment' | 'sales_consumption' | 'transfer_in' | 'transfer_out';
        quantity: number;
        unit: string;
        movement: number;
        before_quantity: number;
        after_quantity: number;
        transaction_date: string;
        reason: string;
        notes: string;
        batch_id: string | null;
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
        status: 'pending' | 'completed' | 'cancelled';
        inventory_processing_status: 'pending' | 'processing' | 'completed' | 'failed';
        inventory_processing_error: string | null;
        inventory_processed_at: string | null;
        created_at: string;
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
      }>;
      owner_inventory_settings: Table<{
        id: boolean;
        near_expiration_days: number;
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
      submit_daily_stock_check: {
        Args: { p_branch_id: string; p_check_date: string; p_remarks: string; p_lines: Json };
        Returns: Json;
      };
      authorize_inventory_discrepancy_adjustment: {
        Args: { p_count_line_id: string; p_reason: string };
        Returns: Database['public']['Tables']['inventory_discrepancy_adjustments']['Row'];
      };
      prepare_batter_batch: {
        Args: { p_branch_id: string; p_batch_reference: string };
        Returns: Database['public']['Tables']['batter_preparation_batches']['Row'];
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
      inspect_sale_reconciliation: {
        Args: { p_transaction_reference: string };
        Returns: Json;
      };
      process_sale_inventory: {
        Args: { p_sale_id: string };
        Returns: Json;
      };
    };
    Enums: {
      app_role: 'owner' | 'staff';
      inventory_transaction_type: 'stock_in' | 'stock_out' | 'usage' | 'waste' | 'spoilage' | 'adjustment' | 'sales_consumption' | 'transfer_in' | 'transfer_out';
    };
    CompositeTypes: Record<string, never>;
  };
};
