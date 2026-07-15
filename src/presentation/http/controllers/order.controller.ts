import { Request, Response } from 'express';
import { inject, injectable } from 'tsyringe';
import {
  OrderService,
  PlaceOrderItemInput,
} from '../../../application/services/order.service';
import { getPagination } from './pagination.util';

@injectable()
export class OrderController {
  constructor(@inject(OrderService) private readonly orderService: OrderService) {}

  place = async (req: Request, res: Response): Promise<void> => {
    const { items } = req.validated!.body as { items: PlaceOrderItemInput[] };
    const order = await this.orderService.placeOrder(req.user!.sub, items);
    res.status(201).json(order);
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const result = await this.orderService.listMyOrders(req.user!.sub, getPagination(req));
    res.status(200).json(result);
  };

  getOne = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.validated!.params as { id: string };
    const order = await this.orderService.getOrderForCustomer(req.user!.sub, id);
    res.status(200).json(order);
  };

  status = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.validated!.params as { id: string };
    const result = await this.orderService.getStatus(req.user!.sub, id);
    res.status(200).json(result);
  };

  cancel = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.validated!.params as { id: string };
    const order = await this.orderService.cancelOrder(req.user!.sub, id);
    res.status(200).json(order);
  };
}
