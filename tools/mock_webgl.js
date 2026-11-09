// ============================================================================
//  Заглушка WebGL2 для интеграционного теста в Node (без GPU).
//  Позволяет прогнать весь код игры: рендер-конвейер, шейдеры, постобработку,
//  UI-привязки — и поймать ошибки JS/логики, которые не видны статически.
// ============================================================================
const CONSTANTS = {
  DEPTH_BUFFER_BIT: 256, STENCIL_BUFFER_BIT: 1024, COLOR_BUFFER_BIT: 16384,
  POINTS: 0, LINES: 1, LINE_LOOP: 2, LINE_STRIP: 3, TRIANGLES: 4, TRIANGLE_STRIP: 5, TRIANGLE_FAN: 6,
  ZERO: 0, ONE: 1, SRC_COLOR: 768, ONE_MINUS_SRC_COLOR: 769, SRC_ALPHA: 770, ONE_MINUS_SRC_ALPHA: 771,
  DST_ALPHA: 772, ONE_MINUS_DST_ALPHA: 773, DST_COLOR: 774, ONE_MINUS_DST_COLOR: 775,
  SRC_ALPHA_SATURATE: 776, CONSTANT_COLOR: 32769, ONE_MINUS_CONSTANT_COLOR: 32770,
  CONSTANT_ALPHA: 32771, ONE_MINUS_CONSTANT_ALPHA: 32772,
  FUNC_ADD: 32774, FUNC_SUBTRACT: 32778, FUNC_REVERSE_SUBTRACT: 32779, MIN: 32775, MAX: 32776,
  BLEND_EQUATION: 32777, BLEND_EQUATION_RGB: 32777, BLEND_EQUATION_ALPHA: 34877,
  BLEND_DST_RGB: 32968, BLEND_SRC_RGB: 32969, BLEND_DST_ALPHA: 32970, BLEND_SRC_ALPHA: 32971,
  BLEND_COLOR: 32773, ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963,
  STREAM_DRAW: 35040, STATIC_DRAW: 35044, DYNAMIC_DRAW: 35048,
  CULL_FACE: 2884, BACK: 1029, FRONT: 1030, FRONT_AND_BACK: 1032,
  TEXTURE_2D: 3553, TEXTURE_CUBE_MAP: 34067, TEXTURE_BINDING_2D: 32873,
  TEXTURE0: 33984, TEXTURE1: 33985, TEXTURE2: 33986, TEXTURE3: 33987, TEXTURE4: 33988,
  TEXTURE5: 33989, TEXTURE6: 33990, TEXTURE7: 33991, TEXTURE8: 33992, TEXTURE9: 33993,
  TEXTURE10: 33994, TEXTURE11: 33995, TEXTURE12: 33996, TEXTURE13: 33997, TEXTURE14: 33998,
  TEXTURE15: 33999,
  TEXTURE_MIN_FILTER: 10241, TEXTURE_MAG_FILTER: 10240, TEXTURE_WRAP_S: 10242, TEXTURE_WRAP_T: 10243,
  NEAREST: 9728, LINEAR: 9729, LINEAR_MIPMAP_LINEAR: 9987,
  CLAMP_TO_EDGE: 33071, REPEAT: 10497, MIRRORED_REPEAT: 33648,
  RGBA: 6408, RGB: 6407, ALPHA: 6406, LUMINANCE: 6409, RGBA8: 32856,
  UNSIGNED_BYTE: 5121, UNSIGNED_SHORT: 5123, UNSIGNED_INT: 5125, FLOAT: 5126, HALF_FLOAT: 5131,
  RGBA16F: 34842, RGBA32F: 34836, DEPTH_COMPONENT: 6402, DEPTH_COMPONENT16: 33189,
  DEPTH_COMPONENT24: 33190, DEPTH24_STENCIL8: 35056, DEPTH_STENCIL: 34041,
  UNSIGNED_INT_24_8: 34042, HALF_FLOAT_OES: 36193,
  FRAMEBUFFER: 36160, RENDERBUFFER: 36161, FRAMEBUFFER_COMPLETE: 36053,
  COLOR_ATTACHMENT0: 36064, DEPTH_ATTACHMENT: 36096, DEPTH_STENCIL_ATTACHMENT: 33306,
  WEBGL_CANVAS: 37446, TRIANGLE_STRIP_ADJACENCY: 35979,
  VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632, COMPILE_STATUS: 35713, LINK_STATUS: 35714,
  ACTIVE_UNIFORMS: 35718, ACTIVE_ATTRIBUTES: 35721,
  ARRAY_BUFFER_BINDING: 34964, CURRENT_PROGRAM: 35725,
  FLOAT_VEC2: 35664, FLOAT_VEC3: 35665, FLOAT_VEC4: 35666,
  INT: 5124, INT_VEC2: 35667, INT_VEC3: 35668, INT_VEC4: 35669, BOOL: 35670,
  FLOAT_MAT2: 35674, FLOAT_MAT3: 35675, FLOAT_MAT4: 35676,
  SAMPLER_2D: 35678, SAMPLER_CUBE: 35680,
  MAX_TEXTURE_IMAGE_UNITS: 34930, MAX_VERTEX_TEXTURE_IMAGE_UNITS: 35660,
  MAX_COMBINED_TEXTURE_IMAGE_UNITS: 35661, MAX_TEXTURE_SIZE: 3379,
  MAX_CUBE_MAP_TEXTURE_SIZE: 34076, MAX_VERTEX_ATTRIBS: 34921,
  MAX_VERTEX_UNIFORM_VECTORS: 36347, MAX_VARYING_VECTORS: 36348,
  MAX_FRAGMENT_UNIFORM_VECTORS: 36349, MAX_SAMPLES: 36183,
  SCISSOR_TEST: 3089, DEPTH_TEST: 2929, BLEND: 3042, POLYGON_OFFSET_FILL: 32823,
  LESS: 513, LEQUAL: 515, ALWAYS: 519, EQUAL: 514, GEQUAL: 518,
  CCW: 2305, CW: 2304, KEEP: 7680, REPLACE: 7681, INVERT: 5386,
  UNPACK_FLIP_Y_WEBGL: 37440, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 37441,
  UNPACK_ALIGNMENT: 3317, PACK_ALIGNMENT: 3333,
  NO_ERROR: 0, INVALID_ENUM: 1280, INVALID_VALUE: 1281, INVALID_OPERATION: 1282,
  VERSION: 7938, VENDOR: 7936, RENDERER: 7937, SHADING_LANGUAGE_VERSION: 35724,
  MAX_ELEMENT_INDEX: 36203, MAX_3D_TEXTURE_SIZE: 32883,
  TEXTURE_3D: 32879, TEXTURE_WRAP_R: 32882,
  UNIFORM_BUFFER: 35345, PIXEL_PACK_BUFFER: 35051, PIXEL_UNPACK_BUFFER: 35052,
  RED: 6403, RG: 33319, R8: 33321, RG8: 33323, RGB8: 32849, SRGB8_ALPHA8: 35907,
  RENDERBUFFER_WIDTH: 36162, RENDERBUFFER_HEIGHT: 36163,
  FRAMEBUFFER_BINDING: 36006, READ_FRAMEBUFFER: 36008, DRAW_FRAMEBUFFER: 36009,
  UNSIGNED_SHORT_5_6_5: 33635, UNSIGNED_SHORT_4_4_4_4: 32819, UNSIGNED_SHORT_5_5_5_1: 32820,
  MOUSE: 0, CONTEXT_LOST_WEBGL: 37442,
};

const SCALAR_LIMITS = {
  MAX_TEXTURE_SIZE: 8192,
  MAX_CUBE_MAP_TEXTURE_SIZE: 8192,
  MAX_TEXTURE_IMAGE_UNITS: 16,
  MAX_VERTEX_TEXTURE_IMAGE_UNITS: 16,
  MAX_COMBINED_TEXTURE_IMAGE_UNITS: 32,
  MAX_VERTEX_ATTRIBS: 16,
  MAX_VERTEX_UNIFORM_VECTORS: 1024,
  MAX_FRAGMENT_UNIFORM_VECTORS: 1024,
  MAX_VARYING_VECTORS: 30,
  MAX_SAMPLES: 8,
  MAX_3D_TEXTURE_SIZE: 2048,
  MAX_ELEMENT_INDEX: 2 ** 32 - 1,
};

function makeProgramObject() {
  return {
    __isProgram: true,
    id: ++uuid,
    uniforms: new Map(),
    attribs: new Map(),
  };
}
let uuid = 0;

export function createMockWebGL2(canvas) {
  const gl = { canvas, __canvas: canvas, drawingBufferWidth: canvas.width, drawingBufferHeight: canvas.height };
  Object.assign(gl, CONSTANTS);

  const glCtx = {
    VERSION: 'WebGL 2.0 (mock)',
    VENDOR: 'Arena mock',
    RENDERER: 'MockGL 2.0',
    SHADING_LANGUAGE_VERSION: 'WebGL GLSL ES 3.00',
  };

  // --- шейдеры
  const shaderSourceErrors = [];
  let currentProgram = null;
  let boundFramebuffer = null;
  let boundRenderbuffer = null;
  let boundVao = { id: 0 };
  const boundTextures = new Map();
  const fallbackTexRef = () => ({ __isTexture: true, id: -2 });
  const boundBuffers = new Map();
  const activeUniforms = new Map();

  gl.__shaderSources = [];
  gl.__programCodes = [];
  gl.__disposed = { programs: 0, textures: 0, buffers: 0, vaos: 0 };

  // Расширения, которые запрашивает three
  const EXTENSIONS = [
    'EXT_color_buffer_float', 'EXT_color_buffer_half_float', 'EXT_float_blend',
    'OES_texture_float_linear', 'EXT_texture_filter_anisotropic',
    'WEBGL_compressed_texture_s3tc', 'WEBGL_compressed_texture_etc', 'KHR_parallel_shader_compile',
    'EXT_blend_minmax', 'WEBGL_multisampled_render_to_texture',
  ];
  gl.getSupportedExtensions = () => EXTENSIONS.slice();
  gl.getExtension = (name) => {
    if (name === 'EXT_texture_filter_anisotropic') return { MAX_TEXTURE_MAX_ANISOTROPY_EXT: 34047, TEXTURE_MAX_ANISOTROPY_EXT: 34046 };
    if (name === 'WEBGL_multisampled_render_to_texture') {
      return {
        renderbufferStorageMultisampleEXT: () => {},
        framebufferTexture2DMultisampleEXT: () => {},
      };
    }
    if (name === 'KHR_parallel_shader_compile') {
      return { COMPLETION_STATUS_KHR: 37297 };
    }
    if (EXTENSIONS.includes(name)) return {};
    return null;
  };

  gl.getParameter = (p) => {
    // числовые константы -> значения
    const numLimits = {
      [gl.MAX_TEXTURE_SIZE]: 8192,
      [gl.MAX_CUBE_MAP_TEXTURE_SIZE]: 8192,
      [gl.MAX_TEXTURE_IMAGE_UNITS]: 32,
      [gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS]: 16,
      [gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS]: 48,
      [gl.MAX_VERTEX_ATTRIBS]: 16,
      [gl.MAX_VERTEX_UNIFORM_VECTORS]: 1024,
      [gl.MAX_FRAGMENT_UNIFORM_VECTORS]: 1024,
      [gl.MAX_VARYING_VECTORS]: 30,
      [gl.MAX_SAMPLES]: 8,
      [gl.MAX_3D_TEXTURE_SIZE]: 2048,
      [gl.MAX_ELEMENT_INDEX]: 4294967294,
      [gl.MAX_TEXTURE_MAX_ANISOTROPY_EXT]: 16,
    };
    if (Object.prototype.hasOwnProperty.call(numLimits, p)) return numLimits[p];
    if (p === gl.VERSION) return glCtx.VERSION;
    if (p === gl.VENDOR) return glCtx.VENDOR;
    if (p === gl.RENDERER) return glCtx.RENDERER;
    if (p === gl.SHADING_LANGUAGE_VERSION) return glCtx.SHADING_LANGUAGE_VERSION;

    if (p === gl.FRAMEBUFFER_BINDING) return boundFramebuffer;
    return 0;
  };
  gl.getError = () => 0;
  gl.isContextLost = () => false;
  gl.getContextAttributes = () => ({ alpha: true, antialias: true, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
  gl.getShaderPrecisionFormat = () => ({ precision: 23, rangeMin: 127, rangeMax: 127 });

  gl.createShader = (type) => ({ __isShader: true, type, id: ++uuid });
  gl.shaderSource = (shader, src) => {
    shader.source = src;
    gl.__shaderSources.push(src);
    // простейшая валидация: непустой и содержит void main
    if (!/void\s+main\s*\(/.test(src || '')) shaderSourceErrors.push('shader without main');
    if ((src || '').includes('undefined')) shaderSourceErrors.push('shader contains "undefined"');
  };
  gl.compileShader = () => {};
  gl.getShaderParameter = (shader, pname) => (pname === gl.COMPILE_STATUS ? true : 0);
  gl.getShaderInfoLog = () => '';
  gl.attachShader = (program, shader) => {
    if (!program || !shader || !shader.__isShader) throw new Error('attachShader: invalid object');
    (program.shaders = program.shaders || []).push(shader);
  };
  gl.detachShader = () => {};
  gl.deleteShader = () => {};
  gl.createProgram = () => {
    const p = makeProgramObject();
    gl.__programCodes.push(p);
    return p;
  };
  gl.linkProgram = (program) => {
    // собираем uniform-ы и атрибуты из исходников (как настоящий драйвер)
    program.uniforms.clear();
    program.attribs.clear();
    for (const sh of program.shaders || []) {
      const src = sh.source || '';
      const uRe = /uniform\s+(highp\s+|mediump\s+|lowp\s+)?(\w+)\s+(\w+)\s*(\[[^\]]*\])?/g;
      let m;
      while ((m = uRe.exec(src))) {
        const type = m[2];
        const name = m[3];
        const size = m[4] ? Math.max(1, parseInt(m[4].match(/\d+/)?.[0] || '1', 10)) : 1;
        const sizeOf = { float: 1, int: 1, bool: 1, vec2: 2, vec3: 3, vec4: 4, ivec2: 2, ivec3: 3, ivec4: 4, mat2: 4, mat3: 9, mat4: 16, sampler2D: 1, samplerCube: 1, sampler3D: 1 }[type] || 1;
        program.uniforms.set(name, { type, size, count: size * sizeOf, name });
      }
      const aRe = /attribute\s+(\w+)\s+(\w+)/g;
      while ((m = aRe.exec(src))) program.attribs.set(m[2], { type: m[1], name: m[2] });
      // GLSL3: in/out в вершинном шейдере
      if (sh.type === gl.VERTEX_SHADER) {
        const inRe = /^\s*in\s+(\w+)\s+(\w+)\s*;/gm;
        while ((m = inRe.exec(src))) program.attribs.set(m[2], { type: m[1], name: m[2] });
      }
    }
  };
  gl.getProgramParameter = (program, pname) => {
    if (pname === gl.LINK_STATUS) return true;
    if (pname === gl.ACTIVE_UNIFORMS) return program.uniforms.size;
    if (pname === gl.ACTIVE_ATTRIBUTES) return program.attribs.size;
    return 0;
  };
  gl.getProgramInfoLog = () => '';
  gl.getActiveUniform = (program, i) => {
    const entry = [...program.uniforms.values()][i];
    if (!entry) return { name: '', size: 0, type: gl.FLOAT };
    const typeConst = {
      float: gl.FLOAT, int: gl.INT, bool: gl.BOOL, vec2: gl.FLOAT_VEC2, vec3: gl.FLOAT_VEC3, vec4: gl.FLOAT_VEC4,
      mat2: gl.FLOAT_MAT2, mat3: gl.FLOAT_MAT3, mat4: gl.FLOAT_MAT4, sampler2D: gl.SAMPLER_2D, samplerCube: gl.SAMPLER_CUBE,
    }[entry.type] ?? gl.FLOAT;
    return { name: entry.name, size: entry.size, type: typeConst };
  };
  gl.getActiveAttrib = (program, i) => {
    const entry = [...program.attribs.values()][i];
    if (!entry) return { name: '', size: 0, type: gl.FLOAT };
    const typeConst = { float: gl.FLOAT, vec2: gl.FLOAT_VEC2, vec3: gl.FLOAT_VEC3, vec4: gl.FLOAT_VEC4 }[entry.type] ?? gl.FLOAT;
    return { name: entry.name, size: 1, type: typeConst };
  };
  gl.getUniformLocation = (program, name) => {
    if (!program || !name) return null;
    const base = name.split('[')[0];
    const info = program.uniforms.get(base) || program.uniforms.get(name);
    return { name, program, info: info || { type: 'float', size: 1 } };
  };
  gl.getAttribLocation = (program, name) => {
    const keys = [...program.attribs.keys()];
    const idx = keys.indexOf(name);
    return idx >= 0 ? idx : 0;
  };
  gl.bindAttribLocation = () => {};
  gl.useProgram = (p) => {
    currentProgram = p;
  };
  gl.deleteProgram = (p) => {
    gl.__disposed.programs++;
  };
  gl.validateProgram = () => {};
  gl.getProgramUniform = () => null;

  // --- uniform-сеттеры (главное: проверять, что значения — числа)
  const setter = (name, arity) => {
    gl[name] = (...args) => {
      const vals = Array.isArray(args[1]) ? Array.from(args[1]) : args.slice(1);
      for (const v of vals) {
        if (typeof v === 'number' && !Number.isFinite(v)) {
          // не бросаем: three на первом кадре пишет служебный cameraPosition —
          // фиксируем находку и продолжаем прогон
          if (globalThis.__MOCK_LOG_NAN) globalThis.__MOCK_LOG_NAN(name, args[0]?.name, args.slice(1));
          return;
        }
      }
      void arity;
    };
  };
  for (const [n, a] of [
    ['uniform1f', 1], ['uniform1i', 1], ['uniform2f', 2], ['uniform3f', 3], ['uniform4f', 4],
    ['uniform1fv', 1], ['uniform2fv', 2], ['uniform3fv', 3], ['uniform4fv', 4],
    ['uniform1iv', 1], ['uniform2iv', 2], ['uniform3iv', 3], ['uniform4iv', 4],
    ['uniformMatrix2fv', 1], ['uniformMatrix3fv', 1], ['uniformMatrix4fv', 1],
    ['uniform1ui', 1], ['uniform2ui', 2], ['uniform3ui', 3], ['uniform4ui', 4],
  ]) {
    setter(n, a);
  }

  // --- буферы
  gl.createBuffer = () => ({ __isBuffer: true, id: ++uuid, data: null });
  gl.bindBuffer = (target, buf) => boundBuffers.set(target, buf);
  gl.bufferData = (target, data, usage) => {
    const b = boundBuffers.get(target);
    if (!b) throw new Error('bufferData: no buffer bound for target ' + target);
    if (b) b.data = data;
  };
  gl.bufferSubData = (target, offset, data) => {
    const b = boundBuffers.get(target);
    if (!b) throw new Error('bufferSubData: no buffer bound');
  };
  gl.deleteBuffer = () => {
    gl.__disposed.buffers++;
  };

  // --- VAO
  gl.createVertexArray = () => ({ __isVao: true, id: ++uuid });
  gl.bindVertexArray = (vao) => {
    boundVao = vao;
  };
  gl.deleteVertexArray = () => {
    gl.__disposed.vaos++;
  };
  gl.enableVertexAttribArray = () => {};
  gl.disableVertexAttribArray = () => {};
  gl.vertexAttribPointer = () => {};
  for (const n of ['vertexAttrib1f','vertexAttrib2f','vertexAttrib3f','vertexAttrib4f','vertexAttrib1fv','vertexAttrib2fv','vertexAttrib3fv','vertexAttrib4fv','vertexAttribI4i','vertexAttribI4ui','vertexAttribI4iv','vertexAttribI4uiv']) gl[n] = () => {};
  gl.drawBuffers = () => {};
  gl.vertexAttribIPointer = () => {};
  gl.vertexAttribDivisor = () => {};

  // --- текстуры
  gl.createTexture = () => ({ __isTexture: true, id: ++uuid });
  gl.bindTexture = (target, tex) => boundTextures.set(target, tex ?? fallbackTexRef());
  const fallbackTex = { __isTexture: true, id: -1 };
  gl.texImage2D = (target, level, internalformat, w, h, border, format, type, data) => {
    const t = boundTextures.get(target) || boundTextures.get(gl.TEXTURE_CUBE_MAP) || fallbackTex;
    if (false) throw new Error('texImage2D: no texture bound');
    if (t) {
      t.levels = (t.levels || 0) + 1;
      // Параметры: (target, level, internalformat, width, height, ...) — 9 аргументов
      if (arguments.length >= 9) {
        if (!Number.isFinite(w) || !Number.isFinite(h) || w < 0 || h < 0) {
          throw new Error(`texImage2D: некорректные размеры ${w}×${h}`);
        }
      }
    }
  };
  gl.texImage3D = () => {};
  gl.texStorage2D = () => {};
  gl.texStorage3D = () => {};
  gl.texSubImage3D = () => {};
  gl.compressedTexSubImage2D = () => {};
  gl.compressedTexImage3D = () => {};
  gl.copyTexImage2D = () => {};
  gl.texSubImage2D = () => {};
  gl.compressedTexImage2D = () => {};
  gl.generateMipmap = () => {};
  gl.texParameteri = () => {};
  gl.texParameterf = () => {};
  gl.activeTexture = (unit) => {};
  gl.deleteTexture = () => {
    gl.__disposed.textures++;
  };
  gl.pixelStorei = () => {};

  // --- фреймбуферы
  gl.createFramebuffer = () => ({ __isFbo: true, id: ++uuid });
  gl.bindFramebuffer = (target, fbo) => {
    boundFramebuffer = fbo;
  };
  gl.framebufferTexture2D = (target, attachment, texTarget, tex, level) => {
    if (!boundFramebuffer) throw new Error('framebufferTexture2D: no FBO bound');
  };
  gl.framebufferTexture2DMultisampleEXT = () => {};
  gl.renderbufferStorageMultisampleEXT = () => {};
  gl.framebufferRenderbuffer = (target, attachment, rbtarget, rb) => {
    if (!boundFramebuffer) throw new Error('framebufferRenderbuffer: no FBO bound');
  };
  gl.checkFramebufferStatus = () => gl.FRAMEBUFFER_COMPLETE;
  gl.deleteFramebuffer = () => {};
  gl.createRenderbuffer = () => ({ __isRb: true, id: ++uuid });
  gl.bindRenderbuffer = (target, rb) => {
    boundRenderbuffer = rb;
  };
  gl.renderbufferStorage = () => {};
  gl.renderbufferStorageMultisample = () => {};
  gl.deleteRenderbuffer = () => {};
  gl.blitFramebuffer = () => {};
  gl.readBuffer = () => {};
  gl.invalidateFramebuffer = () => {};

  // --- состояние
  gl.viewport = () => {};
  gl.scissor = () => {};
  gl.clear = () => {};
  gl.clearColor = () => {};
  gl.clearDepth = () => {};
  gl.clearStencil = () => {};
  gl.clearBufferfv = () => {};
  gl.drawBuffers = () => {};
  gl.readPixels = () => {};
  gl.readBuffer = () => {};
  gl.enable = () => {};
  gl.disable = () => {};
  gl.blendFunc = () => {};
  gl.blendFuncSeparate = () => {};
  gl.blendEquation = () => {};
  gl.blendEquationSeparate = () => {};
  gl.blendColor = () => {};
  gl.depthFunc = () => {};
  gl.depthMask = () => {};
  gl.colorMask = () => {};
  gl.stencilFunc = () => {};
  gl.stencilOp = () => {};
  gl.stencilMask = () => {};
  gl.cullFace = () => {};
  gl.frontFace = () => {};
  gl.polygonOffset = () => {};
  gl.finish = () => {};
  gl.flush = () => {};
  gl.lineWidth = () => {};
  gl.hint = () => {};
  gl.disablei = () => {};
  gl.enablei = () => {};
  gl.drawArrays = () => {};
  gl.drawElements = () => {};
  gl.drawArraysInstanced = () => {};
  gl.drawElementsInstanced = () => {};
  gl.drawRangeElements = () => {};
  gl.multiDrawArraysWEBGL = () => {};
  gl.readPixels = () => {};

  // --- отладка
  gl.__stats = () => ({ programs: gl.__programCodes.length, sources: gl.__shaderSources.length, ...gl.__disposed });
  gl.__shaderSourceErrors = shaderSourceErrors;

  return gl;
}
