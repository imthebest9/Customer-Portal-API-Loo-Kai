import { Request, Response } from 'express';
import { inject, injectable } from 'tsyringe';
import { AuthService, RegisterInput } from '../../../application/services/auth.service';

@injectable()
export class AuthController {
  constructor(@inject(AuthService) private readonly authService: AuthService) {}

  register = async (req: Request, res: Response): Promise<void> => {
    const result = await this.authService.register(req.validated!.body as unknown as RegisterInput);
    res.status(201).json(result);
  };

  login = async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.validated!.body as { email: string; password: string };
    const result = await this.authService.login(email, password);
    res.status(200).json(result);
  };
}
