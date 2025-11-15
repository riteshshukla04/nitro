import type { SourceImport } from '../SourceFile.js'

interface Props {
  /**
   * The name of the Hybrid Object under which it should be registered and exposed to JS to.
   */
  hybridObjectName: string
  /**
   * The name of the C++ class that will be default-constructed
   */
  cppClassName: string
  /**
   * Optional subdirectory path for the header file (e.g., 'cpp' for files in cpp/ subdirectory)
   */
  subdirectory?: string
}

interface CppHybridObjectRegistration {
  cppCode: string
  requiredImports: SourceImport[]
}

export function createCppHybridObjectRegistration({
  hybridObjectName,
  cppClassName,
  subdirectory,
}: Props): CppHybridObjectRegistration {
  const importPath = subdirectory 
    ? `${subdirectory}/${cppClassName}.hpp`
    : `${cppClassName}.hpp`
  return {
    requiredImports: [
      { name: importPath, language: 'c++', space: 'user' },
    ],
    cppCode: `
HybridObjectRegistry::registerHybridObjectConstructor(
  "${hybridObjectName}",
  []() -> std::shared_ptr<HybridObject> {
    static_assert(std::is_default_constructible_v<${cppClassName}>,
                  "The HybridObject \\"${cppClassName}\\" is not default-constructible! "
                  "Create a public constructor that takes zero arguments to be able to autolink this HybridObject.");
    return std::make_shared<${cppClassName}>();
  }
);
      `.trim(),
  }
}
