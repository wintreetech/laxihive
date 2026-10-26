export function submitGatewayForm(data: {
  forwardUrl: string;
  paymentData: Record<string, string>;
}) {
  const target = new URL(data.forwardUrl);
  if (
    ![
      "https://secure.transactworld.com",
      "https://sandbox.transactworld.com",
    ].includes(target.origin) ||
    target.pathname !== "/transaction/Checkout"
  )
    throw new Error(
      "The payment gateway returned an invalid checkout address.",
    );
  const form = document.createElement("form");
  form.method = "POST";
  form.action = target.toString();
  form.hidden = true;
  for (const [name, value] of Object.entries(data.paymentData)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = String(value);
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}
