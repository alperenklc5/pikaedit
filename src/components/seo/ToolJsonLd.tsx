interface ToolJsonLdProps {
  name: string;
  description: string;
  url: string;
  category?: string;
}

export function ToolJsonLd({
  name,
  description,
  url,
  category = "UtilityApplication",
}: ToolJsonLdProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name,
    description,
    url,
    applicationCategory: category,
    operatingSystem: "Any",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
