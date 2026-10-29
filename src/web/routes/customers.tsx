import { Hono, type Context } from "hono";
import { createCustomerDeps, createReadDeps } from "../../container";
import { isNearKarteNoLimit, isValidKarteNo } from "../../domain/karteNo";
import { getCustomerDetail, listCustomerRows } from "../../usecases/adminViews";
import {
  CustomerNotFoundError,
  CustomerValidationError,
  deactivateCustomer,
  previewDeactivation,
  previewDisplayNameImpact,
  registerCustomer,
  updateCustomer,
  type CustomerInput,
} from "../../usecases/customers";
import { ConfirmImpact, CustomerDetailPage, CustomerForm, CustomersPage } from "../pages/Customers";
import { field, render } from "../render";
import type { AppEnv } from "../types";

export const customerRoutes = new Hono<AppEnv>();

function inputOf(body: Record<string, unknown>): CustomerInput {
  return {
    familyName: field(body, "familyName"),
    givenName: field(body, "givenName"),
    familyKana: field(body, "familyKana"),
    givenKana: field(body, "givenKana"),
  };
}

function hiddenOf(input: CustomerInput): Record<string, string> {
  return {
    familyName: input.familyName,
    givenName: input.givenName,
    familyKana: input.familyKana ?? "",
    givenKana: input.givenKana ?? "",
  };
}

function karteNoParam(c: Context<AppEnv>): string | undefined {
  const no = c.req.param("karteNo");
  return no && isValidKarteNo(no) ? no : undefined;
}

customerRoutes.get("/", async (c) => {
  const deps = createReadDeps(c.env);
  const [rows, max] = await Promise.all([listCustomerRows(deps), deps.customers.maxKarteNo()]);
  return render(c, { title: "顧客マスタ", path: "/customers", body: <CustomersPage rows={rows} nearLimit={isNearKarteNoLimit(max)} /> });
});

customerRoutes.get("/new", (c) =>
  render(c, {
    title: "顧客を登録",
    path: "/customers",
    body: <CustomerForm action="/customers" values={{}} submitLabel="登録する" />,
  }),
);

customerRoutes.post("/", async (c) => {
  const body = await c.req.parseBody();
  const input = inputOf(body);
  const deps = createCustomerDeps(c.env);
  try {
    const preview = await previewDisplayNameImpact(deps, input);
    const affectsOthers = preview.displayNameChanges.some((ch) => ch.karteNo !== preview.customer.karteNo);
    if (affectsOthers && field(body, "confirm") !== "1") {
      return render(c, {
        title: "登録内容の確認",
        path: "/customers",
        body: (
          <ConfirmImpact
            action="/customers"
            message="同姓の顧客がいるため、既存の顧客の表示名も変わります。"
            changes={preview.displayNameChanges}
            hidden={hiddenOf(input)}
            submitLabel="この内容で登録する"
            cancelHref="/customers"
          />
        ),
      });
    }
    const { customer } = await registerCustomer(deps, input);
    return c.redirect(`/customers/${customer.karteNo}?msg=created`, 303);
  } catch (e) {
    if (!(e instanceof CustomerValidationError)) throw e;
    return render(c, {
      title: "顧客を登録",
      path: "/customers",
      status: 422,
      body: <CustomerForm action="/customers" values={input} errors={e.fieldErrors} submitLabel="登録する" />,
    });
  }
});

customerRoutes.get("/:karteNo", async (c) => {
  const karteNo = karteNoParam(c);
  const detail = karteNo ? await getCustomerDetail(createReadDeps(c.env), karteNo) : undefined;
  if (!detail) return c.notFound();
  return render(c, { title: `顧客 ${detail.customer.karteNo}`, path: "/customers", body: <CustomerDetailPage {...detail} /> });
});

customerRoutes.post("/:karteNo", async (c) => {
  const karteNo = karteNoParam(c);
  if (!karteNo) return c.notFound();
  const body = await c.req.parseBody();
  const input = inputOf(body);
  const deps = createCustomerDeps(c.env);
  try {
    const preview = await previewDisplayNameImpact(deps, input, karteNo);
    const affectsOthers = preview.displayNameChanges.some((ch) => ch.karteNo !== karteNo);
    if (affectsOthers && field(body, "confirm") !== "1") {
      return render(c, {
        title: "変更内容の確認",
        path: "/customers",
        body: (
          <ConfirmImpact
            action={`/customers/${karteNo}`}
            message="この変更で、他の顧客の表示名も変わります。"
            changes={preview.displayNameChanges}
            hidden={hiddenOf(input)}
            submitLabel="この内容で更新する"
            cancelHref={`/customers/${karteNo}`}
          />
        ),
      });
    }
    await updateCustomer(deps, karteNo, input);
    return c.redirect(`/customers/${karteNo}?msg=updated`, 303);
  } catch (e) {
    if (e instanceof CustomerNotFoundError) return c.notFound();
    if (!(e instanceof CustomerValidationError)) throw e;
    const detail = await getCustomerDetail(createReadDeps(c.env), karteNo);
    if (!detail) return c.notFound();
    return render(c, {
      title: `顧客 ${karteNo}`,
      path: "/customers",
      status: 422,
      body: <CustomerDetailPage {...detail} values={input} errors={e.fieldErrors} />,
    });
  }
});

customerRoutes.post("/:karteNo/deactivate", async (c) => {
  const karteNo = karteNoParam(c);
  if (!karteNo) return c.notFound();
  const body = await c.req.parseBody();
  const deps = createCustomerDeps(c.env);
  try {
    if (field(body, "confirm") !== "1") {
      const preview = await previewDeactivation(deps, karteNo);
      return render(c, {
        title: "論理削除の確認",
        path: "/customers",
        body: (
          <ConfirmImpact
            action={`/customers/${karteNo}/deactivate`}
            message={`カルテ番号 ${karteNo} を論理削除します。元に戻す操作はありません。`}
            changes={preview.displayNameChanges}
            hidden={{}}
            submitLabel="論理削除する"
            danger
            cancelHref={`/customers/${karteNo}`}
          />
        ),
      });
    }
    await deactivateCustomer(deps, karteNo);
    return c.redirect(`/customers/${karteNo}?msg=deactivated`, 303);
  } catch (e) {
    if (e instanceof CustomerNotFoundError) return c.notFound();
    throw e;
  }
});
