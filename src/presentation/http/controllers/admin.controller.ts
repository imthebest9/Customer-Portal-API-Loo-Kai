import { Request, Response } from 'express';
import { inject, injectable } from 'tsyringe';
import { AdminService } from '../../../application/services/admin.service';
import { OrderStatus } from '../../../domain/entities/enums';
import { getPagination } from './pagination.util';

@injectable()
export class AdminController {
  constructor(@inject(AdminService) private readonly adminService: AdminService) {}

  listCustomers = async (req: Request, res: Response): Promise<void> => {
    const result = await this.adminService.listCustomers(getPagination(req));
    res.status(200).json(result);
  };

  deleteCustomer = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.validated!.params as { id: string };
    await this.adminService.deleteCustomer(id);
    res.status(204).send();
  };

  deactivateCustomer = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.validated!.params as { id: string };
    const customer = await this.adminService.deactivateCustomer(id);
    res.status(200).json(customer);
  };

  listOrders = async (req: Request, res: Response): Promise<void> => {
    const result = await this.adminService.listAllOrders(getPagination(req));
    res.status(200).json(result);
  };

  updateOrderStatus = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.validated!.params as { id: string };
    const { status } = req.validated!.body as { status: OrderStatus };
    const order = await this.adminService.updateOrderStatus(id, status);
    res.status(200).json(order);
  };
}
