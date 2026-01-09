import { useTranslation } from 'react-i18next';

const SchemasList = () => {
  const { t } = useTranslation();

  return (
    <>
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('common:docs.api_schemas')}</h1>
        <p className="text-muted-foreground">{t('common:docs.schema_definitions')}</p>
      </header>

      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-lg text-muted-foreground">{t('common:docs.coming_soon')}</p>
        <p className="text-sm text-muted-foreground/70 mt-2">{t('common:docs.schema_docs_in_development')}</p>
      </div>
    </>
  );
};

export default SchemasList;
