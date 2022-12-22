import { sha256_sync } from "ton-crypto";
import { CompilerContext, createContextStore } from "../context";
import { ASTNode, traverse } from "../grammar/ast";
import { resolveConstantValue } from "./resolveConstantValue";
import { getAllStaticFunctions, getAllTypes } from "./resolveDescriptors";

let store = createContextStore<{ value: string, id: number }>();
let exceptions = createContextStore<{ value: string, id: number }>();

function stringId(src: string): number {
    return sha256_sync(src).readUint32BE(0);
}

function exceptionId(src: string): number {
    return stringId(src) % 63000 + 1000;
}

function resolveStringsInAST(ast: ASTNode, ctx: CompilerContext) {
    traverse(ast, (node) => {
        if (node.kind === 'string') {
            if (!store.get(ctx, node.value)) {
                let id = stringId(node.value);
                if (Object.values(store.all(ctx)).find((v) => v.id === id)) {
                    throw new Error(`Duplicate string id: ${node.value}`);
                }
                ctx = store.set(ctx, node.value, { value: node.value, id });
            }
        }

        if (node.kind === 'op_static_call' && node.name === 'require') {
            if (node.args.length !== 2) {
                return;
            }
            let resolved = resolveConstantValue({ kind: 'ref', name: 'String', optional: false }, node.args[1]) as string;
            if (!exceptions.get(ctx, resolved)) {
                let id = exceptionId(resolved);
                if (Object.values(exceptions.all(ctx)).find((v) => v.id === id)) {
                    throw new Error(`Duplicate error id: ${resolved}`);
                }
                ctx = exceptions.set(ctx, resolved, { value: resolved, id });
            }
        }
    })
    return ctx;
}

export function resolveStrings(ctx: CompilerContext) {

    // Process all static functions
    for (let f of Object.values(getAllStaticFunctions(ctx))) {
        ctx = resolveStringsInAST(f.ast, ctx);
    }

    // Process all types
    for (let t of Object.values(getAllTypes(ctx))) {

        // Process init
        if (t.init) {
            ctx = resolveStringsInAST(t.init.ast, ctx);
        }

        // Process receivers
        for (const f of Object.values(t.receivers)) {
            ctx = resolveStringsInAST(f.ast, ctx);
        }

        // Process functions
        for (let f of t.functions.values()) {
            ctx = resolveStringsInAST(f.ast, ctx);
        }
    }

    return ctx;
}

export function getAllStrings(ctx: CompilerContext) {
    return Object.values(store.all(ctx));
}

export function getStringId(value: string, ctx: CompilerContext) {
    let ex = store.get(ctx, value);
    if (!ex) {
        throw new Error(`String not found: ${value}`);
    }
    return ex.id;
}

export function getAllErrors(ctx: CompilerContext) {
    return Object.values(exceptions.all(ctx));
}

export function getErrorId(value: string, ctx: CompilerContext) {
    let ex = exceptions.get(ctx, value);
    if (!ex) {
        throw new Error(`Error not found: ${value}`);
    }
    return ex.id;
}