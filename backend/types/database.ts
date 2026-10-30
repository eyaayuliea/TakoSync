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
      }>;
      products: Table<{
        id: string;
        product_name: string;
        description: string;
        price: number;
        is_available: boolean;
        created_at: string;
        updated_at: string;
      }>;
      recipes: Table<{
        id: string;
        product_id: string;
        ingredient_id: string;
        quantity_required: number;
        unit_of_measure: string;
      }>;
      sales: Table<{
        id: string;
        transaction_reference: string;
        branch_id: string;
        staff_id: string;
        total_amount: number;
        payment_method: string;
        status: 'pending' | 'completed' | 'cancelled';
        created_at: string;
      }>;
      sale_items: Table<{
        id: string;
        sale_id: string;
        product_id: string;
        quantity: number;
        unit_price: number;
        subtotal: number;
      }>;
      audit_logs: Table<{
        id: string;
        user_id: string | null;
        branch_id: string | null;
        action: string;
        description: string;
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
      record_inventory_transactions: {
        Args: { p_branch_id: string; p_transactions: Json };
        Returns: Database['public']['Tables']['inventory_movements']['Row'][];
      };
      submit_daily_stock_check: {
        Args: { p_branch_id: string; p_check_date: string; p_remarks: string; p_lines: Json };
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
