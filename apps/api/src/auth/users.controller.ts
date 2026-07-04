import { BadRequestException, Body, Controller, NotFoundException, Param, Patch } from "@nestjs/common";
import { UpdateRolesInput } from "@mydaust/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { type AuthUser, CurrentUser } from "./current-user.js";
import { Roles } from "./decorators.js";

@Controller("users")
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  /** Replace a person's role set. Role changes are a plan non-negotiable for audit logging. */
  @Patch(":id/roles")
  @Roles("it_admin", "admin")
  async updateRoles(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const { roles } = UpdateRolesInput.parse(body);
    if (id === user.personId) {
      throw new BadRequestException("You cannot change your own roles (lockout guard)");
    }
    const person = await this.prisma.person.findUnique({ where: { id } });
    if (!person) throw new NotFoundException("User not found");

    const updated = await this.prisma.person.update({ where: { id }, data: { roles: [...roles] } });
    await this.prisma.auditLog.create({
      data: {
        entity: "Person",
        entityId: id,
        action: "roles-changed",
        actorId: user.personId,
        data: { from: person.roles, to: roles },
      },
    });
    return { id: updated.id, email: updated.email, roles: updated.roles };
  }
}
