import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { z } from "zod";
import { ContactInput } from "@mydaust/shared";
import { Public, Roles } from "../auth/decorators.js";
import { ContactService } from "./contact.service.js";

const ReadInput = z.object({ read: z.boolean() });

@Controller("contact")
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  /** Public: the vitrine "Contact us" form posts here; stored in the CMS inbox. */
  @Public()
  @Post()
  create(@Body() body: unknown) {
    return this.contact.create(ContactInput.parse(body));
  }

  @Get()
  @Roles("communications", "admin")
  list() {
    return this.contact.list();
  }

  @Patch(":id/read")
  @Roles("communications", "admin")
  markRead(@Param("id") id: string, @Body() body: unknown) {
    return this.contact.markRead(id, ReadInput.parse(body).read);
  }
}
