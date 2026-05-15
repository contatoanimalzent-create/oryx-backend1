import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { createOrderSchema, createProductSchema, updateProductSchema } from './dto/marketplace.dto';
import { MarketplaceService } from './marketplace.service';

function parse<T>(schema: { parse: (v: unknown) => T }, value: unknown): T {
  return schema.parse(value);
}

@ApiTags('marketplace')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly market: MarketplaceService) {}

  // Listings
  @Get('products')
  list(
    @Query('category') category?: string,
    @Query('city') city?: string,
    @Query('state') state?: string,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
  ) {
    return this.market.listProducts({
      category,
      city,
      state,
      cursor,
      take: take ? Number(take) : undefined,
    });
  }

  @Get('products/:id')
  product(@Param('id', ParseUUIDPipe) id: string) {
    return this.market.getProduct(id);
  }

  @Post('products')
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser('id') userId: string, @Body() body: unknown) {
    return this.market.createProduct(userId, parse(createProductSchema, body));
  }

  @Patch('products/:id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.market.updateProduct(userId, id, parse(updateProductSchema, body));
  }

  @Delete('products/:id')
  remove(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.market.removeProduct(userId, id);
  }

  @Get('me/listings')
  myListings(@CurrentUser('id') userId: string) {
    return this.market.listMyListings(userId);
  }

  // Orders
  @Post('orders')
  @HttpCode(HttpStatus.CREATED)
  order(@CurrentUser('id') userId: string, @Body() body: unknown) {
    return this.market.createOrder(userId, parse(createOrderSchema, body));
  }

  @Get('me/orders')
  myOrders(@CurrentUser('id') userId: string) {
    return this.market.listMyOrders(userId);
  }

  @Get('orders/:id')
  getOrder(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.market.getOrder(userId, id);
  }
}
