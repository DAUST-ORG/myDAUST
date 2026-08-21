import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  CreateUserInput,
  SuspendUserInput,
  UpdateUserInput,
  UpdateRolesInput,
  UserListQuery,
} from "@mydaust/shared";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import { UsersService } from "./users.service.js";

/**
 * Directory administration for the director area.
 *
 * The role list is declared ONCE, here on the class, and deliberately on no method.
 * `getAllAndOverride([handler, class])` means a method-level list REPLACES this one rather
 * than intersecting it, so a narrower decorator added to any single route later would
 * silently drop it_admin from that route without touching this line. Everything that needs
 * to be narrower than "admin or it_admin" is enforced in the service against the target's
 * roles, which a guard cannot see.
 */
@Controller("users")
@Roles("admin", "it_admin")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query() query: unknown) {
    // There is no global ValidationPipe; unparsed page/pageSize reach Prisma as NaN and 500.
    return this.users.list(UserListQuery.parse(query));
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.users.create(user, CreateUserInput.parse(body));
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.users.update(user, id, UpdateUserInput.parse(body));
  }

  @Patch(":id/roles")
  updateRoles(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const { roles } = UpdateRolesInput.parse(body);
    return this.users.setRoles(user, id, roles);
  }

  /** Returns a working temp password ONCE. Never logged, never stored in plaintext. */
  @Post(":id/reset-password")
  resetPassword(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.users.resetPassword(user, id);
  }

  @Post(":id/suspend")
  suspend(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.users.suspend(user, id, SuspendUserInput.parse(body ?? {}));
  }

  @Post(":id/restore")
  restore(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.users.restore(user, id);
  }
}
