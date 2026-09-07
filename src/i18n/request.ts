import { getRequestConfig } from "next-intl/server";
import { isLocale, DEFAULT_LOCALE } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isLocale(requested) ? requested : DEFAULT_LOCALE;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: "Asia/Muscat",
    now: new Date(),
  };
});
