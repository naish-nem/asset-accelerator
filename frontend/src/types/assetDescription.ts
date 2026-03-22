/** Mirrors backend `AssetDescription` (Pydantic) from POST /extract */
export type AssetDescription = {
  main_object: string;
  visual_texture_material: string;
  shape_silhouette: string;
  color_palette: string;
  art_style: string;
  perspective_orientation: string;
  lighting_shading: string;
  surface_details: string;
  semantic_category: string;
  depth_form_hints_3d: string;
  notes_other: string;
  analyzer_provider: string;
};

export type ExtractedAssetItem = {
  id: number;
  url: string;
  name: string;
  assetDescription?: AssetDescription;
};
