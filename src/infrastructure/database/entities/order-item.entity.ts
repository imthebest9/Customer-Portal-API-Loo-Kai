import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { numericTransformer } from './numeric.transformer';
import { OrderEntity } from './order.entity';
import { ProductEntity } from './product.entity';

@Entity({ name: 'order_items' })
export class OrderItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_order_items_order_id')
  @Column({ type: 'uuid', name: 'order_id' })
  orderId: string;

  @ManyToOne(() => OrderEntity, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: OrderEntity;

  @Column({ type: 'uuid', name: 'product_id' })
  productId: string;

  @ManyToOne(() => ProductEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_id' })
  product: ProductEntity;

  // Snapshot of the product name at purchase time (products may be renamed later).
  @Column({ type: 'varchar', length: 255, name: 'product_name' })
  productName: string;

  @Column({ type: 'integer' })
  quantity: number;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    name: 'unit_price',
    transformer: numericTransformer,
  })
  unitPrice: number;
}
