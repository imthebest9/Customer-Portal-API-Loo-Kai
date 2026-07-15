import { Request, Response } from 'express';
import { inject, injectable } from 'tsyringe';
import { ProductService } from '../../../application/services/product.service';
import { getPagination } from './pagination.util';

@injectable()
export class ProductController {
  constructor(@inject(ProductService) private readonly productService: ProductService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const result = await this.productService.list(getPagination(req));
    res.status(200).json(result);
  };
}
