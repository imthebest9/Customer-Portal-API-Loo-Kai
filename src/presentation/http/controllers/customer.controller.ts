import { Request, Response } from 'express';
import { inject, injectable } from 'tsyringe';
import {
  CustomerService,
  UpdateProfileInput,
} from '../../../application/services/customer.service';

@injectable()
export class CustomerController {
  constructor(@inject(CustomerService) private readonly customerService: CustomerService) {}

  getMe = async (req: Request, res: Response): Promise<void> => {
    const profile = await this.customerService.getProfile(req.user!.sub);
    res.status(200).json(profile);
  };

  updateMe = async (req: Request, res: Response): Promise<void> => {
    const updated = await this.customerService.updateProfile(
      req.user!.sub,
      req.validated!.body as UpdateProfileInput,
    );
    res.status(200).json(updated);
  };

  changePassword = async (req: Request, res: Response): Promise<void> => {
    const { currentPassword, newPassword } = req.validated!.body as {
      currentPassword: string;
      newPassword: string;
    };
    await this.customerService.changePassword(req.user!.sub, currentPassword, newPassword);
    res.status(204).send();
  };
}
