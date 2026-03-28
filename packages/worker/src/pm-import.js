export const SUPPORTED_IMPORT_PROVIDERS = ['jira'];
export function isSupportedImportProvider(p) {
    return SUPPORTED_IMPORT_PROVIDERS.includes(p);
}
