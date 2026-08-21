import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { api } from "../lib/api";

type Currency = {
  code: string;
  name: string;
  symbol?: string | null;
};

type UserCurrency = {
  id: string;
  currencyCode: string;
  isDefault: boolean;
  currency: Currency;
};

export function CurrencySettingsPage() {
  const queryClient = useQueryClient();
  const [currencyCode, setCurrencyCode] = useState("AED");
  const { data: currenciesData } = useQuery({
    queryKey: ["currencies"],
    queryFn: () => api<{ data: Currency[] }>("/currencies")
  });
  const { data: userCurrenciesData } = useQuery({
    queryKey: ["user-currencies"],
    queryFn: () => api<{ data: UserCurrency[] }>("/user-currencies")
  });
  const addCurrency = useMutation({
    mutationFn: (input: { currencyCode: string }) =>
      api<{ data: UserCurrency }>("/user-currencies", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user-currencies"] })
  });
  const removeCurrency = useMutation({
    mutationFn: (code: string) =>
      api<void>(`/user-currencies/${code}`, {
        method: "DELETE"
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user-currencies"] })
  });

  const currencies = currenciesData?.data ?? [];
  const userCurrencies = userCurrenciesData?.data ?? [];
  const availableCurrencies = useMemo(
    () => {
      const selectedCodes = new Set(userCurrencies.map((item) => item.currencyCode));
      return currencies.filter((currency) => !selectedCodes.has(currency.code));
    },
    [currencies, userCurrencies]
  );

  useEffect(() => {
    if (availableCurrencies.length > 0 && !availableCurrencies.some((currency) => currency.code === currencyCode)) {
      setCurrencyCode(availableCurrencies[0]!.code);
    }
  }, [availableCurrencies, currencyCode]);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Currency settings</h1>
        </div>
      </header>
      <section className="form-card settings-form">
        <div>
          <p className="eyebrow">Currencies</p>
          <h2>Your currencies</h2>
        </div>
        <div className="inline-editor">
          <label>
            Add currency
            <select value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value)}>
              {availableCurrencies.length === 0 ? <option value="">All currencies added</option> : null}
              {availableCurrencies.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.code} - {currency.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="primary-button compact"
            type="button"
            disabled={availableCurrencies.length === 0 || addCurrency.isPending}
            onClick={() => addCurrency.mutate({ currencyCode })}
          >
            Add
          </button>
        </div>
        {addCurrency.error ? <div className="form-error">{addCurrency.error.message}</div> : null}
        {removeCurrency.error ? <div className="form-error">{removeCurrency.error.message}</div> : null}
        <div className="currency-grid">
          {userCurrencies.map((item) => (
            <div className="currency-tile" key={item.id}>
              <div>
                <strong>{item.currencyCode}</strong>
                <span>{item.currency.name}</span>
              </div>
              <button
                className="icon-button danger"
                type="button"
                title={`Remove ${item.currencyCode}`}
                disabled={removeCurrency.isPending}
                onClick={() => removeCurrency.mutate(item.currencyCode)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
