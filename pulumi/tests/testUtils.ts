const structProto = require("google-protobuf/google/protobuf/struct_pb");

/**
 * Build a fake gRPC call object for check handlers.
 * Uses real protobuf Struct objects so serialization round-trips are tested.
 */
export function makeCheckCall(inputs: Record<string, any>) {
  const newsStruct = structProto.Struct.fromJavaScript(inputs);
  return {
    request: {
      getNews: () => newsStruct,
      getType: () => "",
      getUrn: () => "",
    },
  };
}

/**
 * Build a fake gRPC call object for diff handlers.
 */
export function makeDiffCall(
  olds: Record<string, any>,
  news: Record<string, any>,
) {
  const oldsStruct = structProto.Struct.fromJavaScript(olds);
  const newsStruct = structProto.Struct.fromJavaScript(news);
  return {
    request: {
      getOlds: () => oldsStruct,
      getNews: () => newsStruct,
      getType: () => "",
      getUrn: () => "",
    },
  };
}

/**
 * Build a fake gRPC call object for create handlers.
 */
export function makeCreateCall(
  inputs: Record<string, any>,
  preview = false,
) {
  const propsStruct = structProto.Struct.fromJavaScript(inputs);
  return {
    request: {
      getProperties: () => propsStruct,
      getPreview: () => preview,
      getType: () => "",
      getUrn: () => "",
    },
  };
}

/**
 * Build a fake gRPC call object for read handlers.
 */
export function makeReadCall(
  id: string,
  inputs: Record<string, any> = {},
) {
  const inputsStruct = structProto.Struct.fromJavaScript(inputs);
  return {
    request: {
      getId: () => id,
      getInputs: () => inputsStruct,
      getProperties: () => inputsStruct,
      getType: () => "",
      getUrn: () => "",
    },
  };
}

/**
 * Build a fake gRPC call object for update handlers.
 */
export function makeUpdateCall(
  id: string,
  olds: Record<string, any>,
  news: Record<string, any>,
  preview = false,
) {
  const oldsStruct = structProto.Struct.fromJavaScript(olds);
  const newsStruct = structProto.Struct.fromJavaScript(news);
  return {
    request: {
      getId: () => id,
      getOlds: () => oldsStruct,
      getNews: () => newsStruct,
      getPreview: () => preview,
      getType: () => "",
      getUrn: () => "",
    },
  };
}

/**
 * Build a fake gRPC call object for delete handlers.
 */
export function makeDeleteCall(id: string) {
  return {
    request: {
      getId: () => id,
      getType: () => "",
      getUrn: () => "",
    },
  };
}

/**
 * Invoke a handler and collect the callback result.
 * Returns { err, response }.
 */
export function callHandler(
  handler: (call: any, callback: any) => Promise<void>,
  call: any,
): Promise<{ err: any; response: any }> {
  return new Promise((resolve) => {
    handler(call, (err: any, response: any) => {
      resolve({ err, response });
    });
  });
}
