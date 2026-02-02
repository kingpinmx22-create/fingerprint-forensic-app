import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Upload, Loader2, CheckCircle2, XCircle, Info, Download, History, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caseId, setCaseId] = useState("");
  const [sampleId, setSampleId] = useState("");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = trpc.texture.uploadImage.useMutation();
  const applyTextureMutation = trpc.texture.applyTexture.useMutation();
  const historyQuery = trpc.texture.getHistory.useQuery({ limit: 10 });
  const promptInfoQuery = trpc.texture.getPromptInfo.useQuery();
  const deleteProcessingMutation = trpc.texture.deleteProcessing.useMutation();

  const handleDeleteProcessing = async (id: number) => {
    if (window.confirm("¿Estás seguro de que deseas eliminar este procesamiento?")) {
      try {
        await deleteProcessingMutation.mutateAsync({ id });
        toast.success("Procesamiento eliminado");
        historyQuery.refetch();
      } catch (error) {
        toast.error(`Error: ${error instanceof Error ? error.message : "Error desconocido"}`);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Por favor selecciona una imagen válida");
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
    setResult(null);
  };

  const handleProcess = async () => {
    if (!selectedFile || !previewUrl) {
      toast.error("Por favor selecciona una imagen primero");
      return;
    }

    setProcessing(true);
    setResult(null);

    try {
      const uploadResult = await uploadMutation.mutateAsync({
        imageData: previewUrl,
        filename: selectedFile.name,
        caseId: caseId || undefined,
        sampleId: sampleId || undefined,
      });

      toast.success("Imagen cargada, procesando con IA...");

      const textureResult = await applyTextureMutation.mutateAsync({
        fingerprintImageUrl: uploadResult.url,
        originalFilename: selectedFile.name,
        caseId: caseId || undefined,
        sampleId: sampleId || undefined,
        enableLlmAnalysis: true,
        sendNotification: true,
      });

      setResult(textureResult);
      toast.success("¡Procesamiento completado!");
      historyQuery.refetch();
    } catch (error) {
      console.error("Error processing:", error);
      toast.error(`Error: ${error instanceof Error ? error.message : "Error desconocido"}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
      setResult(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Sistema Forense de Huellas Dactilares
          </h1>
          <p className="text-muted-foreground">
            Aplicación de textura de membrana celular con IA avanzada
          </p>
        </div>

        <Tabs defaultValue="process" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="process">Procesar</TabsTrigger>
            <TabsTrigger value="history">Historial</TabsTrigger>
            <TabsTrigger value="info">Información</TabsTrigger>
          </TabsList>

          <TabsContent value="process" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Cargar y Procesar Huella Dactilar</CardTitle>
                <CardDescription>
                  Sube una huella dactilar para aplicar textura de membrana celular con IA
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="caseId">ID de Caso (Opcional)</Label>
                    <Input
                      id="caseId"
                      placeholder="CASE-2024-001"
                      value={caseId}
                      onChange={(e) => setCaseId(e.target.value)}
                      disabled={processing}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sampleId">ID de Muestra (Opcional)</Label>
                    <Input
                      id="sampleId"
                      placeholder="SAMPLE-001"
                      value={sampleId}
                      onChange={(e) => setSampleId(e.target.value)}
                      disabled={processing}
                    />
                  </div>
                </div>

                <div
                  className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors bg-background"
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {previewUrl ? (
                    <div className="space-y-4">
                      <img
                        src={previewUrl}
                        alt="Preview"
                        className="max-h-80 mx-auto rounded-lg shadow-md border"
                      />
                      <p className="text-sm text-muted-foreground font-medium">
                        {selectedFile?.name}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4 py-8">
                      <Upload className="w-16 h-16 mx-auto text-muted-foreground" />
                      <div>
                        <p className="text-base font-medium">
                          Arrastra una imagen o haz clic para seleccionar
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">
                          PNG, JPG hasta 10MB
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                <Button
                  onClick={handleProcess}
                  disabled={!selectedFile || processing}
                  className="w-full"
                  size="lg"
                >
                  {processing ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Procesando con IA...
                    </>
                  ) : (
                    "Aplicar Textura de Membrana Celular"
                  )}
                </Button>

                {processing && (
                  <div className="space-y-3 bg-blue-50 dark:bg-blue-950 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                      <span className="text-sm font-medium">
                        La IA está procesando tu huella con máxima calidad...
                      </span>
                    </div>
                    <Progress value={undefined} className="w-full" />
                  </div>
                )}
              </CardContent>
            </Card>

            {result && previewUrl && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      Procesamiento Completado
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-muted p-4 rounded-lg text-center">
                        <p className="text-xs text-muted-foreground mb-1">Tiempo</p>
                        <p className="text-lg font-bold">{result.processingTimeMs}ms</p>
                      </div>
                      <div className="bg-muted p-4 rounded-lg text-center">
                        <p className="text-xs text-muted-foreground mb-1">Versión</p>
                        <p className="text-lg font-bold">{result.promptVersion}</p>
                      </div>
                      <div className="bg-muted p-4 rounded-lg text-center">
                        <p className="text-xs text-muted-foreground mb-1">Score</p>
                        <p className="text-lg font-bold text-green-600">
                          {result.qualityMetrics ? 
                            `${(result.qualityMetrics.overallScore * 100).toFixed(0)}%` 
                            : 'N/A'}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium mb-2">Imagen Original</p>
                        <img src={previewUrl} alt="Original" className="w-full rounded border" />
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-2">Imagen Procesada</p>
                        <img src={result.processedImageUrl} alt="Procesada" className="w-full rounded border" />
                      </div>
                    </div>

                    {result.llmAnalysis && (
                      <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg border border-amber-200 dark:border-amber-800">
                        <p className="text-sm font-medium mb-2">Análisis de Calidad</p>
                        <p className="text-sm text-muted-foreground">{result.llmAnalysis.qualityAssessment}</p>
                      </div>
                    )}

                    <Button
                      variant="default"
                      className="w-full"
                      size="lg"
                      onClick={() => window.open(result.processedImageUrl, "_blank")}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Descargar Imagen Procesada
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Historial de Procesamientos
                </CardTitle>
                <CardDescription>
                  Últimos procesamientos realizados
                </CardDescription>
              </CardHeader>
              <CardContent>
                {historyQuery.isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : historyQuery.data?.items && historyQuery.data.items.length > 0 ? (
                  <div className="space-y-4">
                    {historyQuery.data.items.map((item: any) => {
                      const score = item.qualityMetrics?.overallScore ?? item.llmAnalysis?.confidenceScore ?? 0;
                      return (
                        <div key={item.id} className="border rounded-lg p-4 space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="font-medium">{item.originalFilename || "Sin nombre"}</p>
                              <p className="text-sm text-muted-foreground">
                                Caso: {item.caseId || "N/A"} | Muestra: {item.sampleId || "N/A"}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {new Date(item.createdAt).toLocaleString()}
                              </p>
                            </div>
                            <div className="text-right flex flex-col items-end gap-2">
                              <div>
                                {item.status === "completed" && (
                                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                                )}
                                {item.status === "processing" && (
                                  <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                                )}
                                {item.status === "failed" && (
                                  <XCircle className="h-5 w-5 text-red-500" />
                                )}
                              </div>
                              <div className="bg-green-100 dark:bg-green-950 px-2 py-1 rounded text-sm font-bold text-green-700 dark:text-green-300">
                                {(score * 100).toFixed(0)}%
                              </div>
                            </div>
                          </div>

                          {item.status === "completed" && item.originalImageUrl && item.processedImageUrl && (
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <p className="text-xs font-medium mb-1">Original</p>
                                <img src={item.originalImageUrl} alt="Original" className="w-full rounded border cursor-pointer hover:opacity-80" onClick={() => window.open(item.originalImageUrl, "_blank")} />
                              </div>
                              <div>
                                <p className="text-xs font-medium mb-1">Procesada</p>
                                <img src={item.processedImageUrl} alt="Procesada" className="w-full rounded border cursor-pointer hover:opacity-80" onClick={() => window.open(item.processedImageUrl, "_blank")} />
                              </div>
                            </div>
                          )}

                          {item.status === "completed" && (
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={() => window.open(item.originalImageUrl, "_blank")}
                              >
                                <Download className="mr-1 h-4 w-4" />
                                Original
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={() => window.open(item.processedImageUrl, "_blank")}
                              >
                                <Download className="mr-1 h-4 w-4" />
                                Procesada
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDeleteProcessing(item.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    No hay procesamientos aún
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="info" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  Información del Sistema
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {promptInfoQuery.data && (
                  <>
                    <div>
                      <p className="font-medium mb-2">Versión del Prompt</p>
                      <p className="text-sm text-muted-foreground">{promptInfoQuery.data.version}</p>
                    </div>

                    <div>
                      <p className="font-medium mb-2">Descripción</p>
                      <p className="text-sm text-muted-foreground">{promptInfoQuery.data.description}</p>
                    </div>

                    <div>
                      <p className="font-medium mb-3">Características</p>
                      <ul className="space-y-2">
                        {promptInfoQuery.data.features.map((feature: string, idx: number) => (
                          <li key={idx} className="text-sm text-muted-foreground flex gap-2">
                            <span className="text-primary">•</span>
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
