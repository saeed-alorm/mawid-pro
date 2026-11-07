import { test, expect } from "@playwright/test";

test("Pages deep links hydrate with working booking navigation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/mawid-pro/customer/cedar-steel");
  await expect(page.getByRole("heading", { name: "Cedar & Steel", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Book an appointment", exact: true }).first().click();
  await expect(page).toHaveURL(/\/mawid-pro\/customer\/cedar-steel\/book/);
  await expect(page.getByRole("heading", { name: "Choose a service", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Arabic direction persists on reload and staff routes work", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/mawid-pro/");
  await page.getByRole("button", { name: "AR", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.goto("/mawid-pro/manage/cedar-steel/calendar");
  await expect(page.getByRole("heading", { name: "التقويم", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
