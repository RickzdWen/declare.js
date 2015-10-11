/**
 * Created by rick on 14-5-16.
 */

var op = Object.prototype, opts = op.toString, xtor = new Function, counter = 0, cname='constructor';

var _extraNames = "hasOwnProperty.valueOf.isPrototypeOf.propertyIsEnumerable.toLocaleString.toString.constructor".split(".");
var _extraLen = _extraNames.length;

function err(msg, cls){ throw new Error("declare" + (cls ? " " + cls : "") + ": " + msg); }

// C3 Method Resolution Order (see http://www.python.org/download/releases/2.3/mro/)
function c3mro(bases, className){
    var result = [], roots = [{cls: 0, refs: []}], nameMap = {}, clsCount = 1,
        l = bases.length, i = 0, j, lin, base, top, proto, rec, name, refs;

    // build a list of bases naming them if needed
    for(; i < l; ++i){
        base = bases[i];
        if(!base){
            err("mixin #" + i + " is unknown. Did you use require to pull it in?", className);
        }else if(opts.call(base) != "[object Function]"){
            err("mixin #" + i + " is not a callable constructor.", className);
        }
        lin = base._meta ? base._meta.bases : [base];
        top = 0;
        // add bases to the name map
        for(j = lin.length - 1; j >= 0; --j){
            proto = lin[j].prototype;
            if(!proto.hasOwnProperty("declaredClass")){
                proto.declaredClass = "uniqName_" + (counter++);
            }
            name = proto.declaredClass;
            if(!nameMap.hasOwnProperty(name)){
                nameMap[name] = {count: 0, refs: [], cls: lin[j]};
                ++clsCount;
            }
            rec = nameMap[name];
            if(top && top !== rec){
                rec.refs.push(top);
                ++top.count;
            }
            top = rec;
        }
        ++top.count;
        roots[0].refs.push(top);
    }

    // remove classes without external references recursively
    while(roots.length){
        top = roots.pop();
        result.push(top.cls);
        --clsCount;
        // optimization: follow a single-linked chain
        while(refs = top.refs, refs.length == 1){
            top = refs[0];
            if(!top || --top.count){
                // branch or end of chain => do not end to roots
                top = 0;
                break;
            }
            result.push(top.cls);
            --clsCount;
        }
        if(top){
            // branch
            for(i = 0, l = refs.length; i < l; ++i){
                top = refs[i];
                if(!--top.count){
                    roots.push(top);
                }
            }
        }
    }
    if(clsCount){
        err("can't build consistent linearization", className);
    }

    // calculate the superclass offset
    base = bases[0];
    result[0] = base ?
            base._meta && base === result[result.length - base._meta.bases.length] ?
        base._meta.bases.length : 1 : 0;

    return result;
}

function declare(className, superclass, props) {
    if (typeof className != "string") {
        props = superclass;
        superclass = className;
        className = "";
    }
    props = props || [];

    var proto, i, t, ctor, name, bases, chains, mixins = 1, parents = superclass;

    if(opts.call(superclass) == "[object Array]"){
        bases = c3mro(superclass, className);
        t = bases[0];
        mixins = bases.length - t;
        superclass = bases[mixins];
    } else {
        bases = [0];
        if(superclass){
            if(opts.call(superclass) == "[object Function]"){
                t = superclass._meta;
                bases = bases.concat(t ? t.bases : superclass);
            }else{
                err("base class is not a callable constructor.", className);
            }
        }else if(superclass !== null){
            err("unknown base class. Did you use require to pull it in?", className);
        }
    }

    if (superclass) {
        for (i = mixins - 1;; --i) {
            proto = forceNew(superclass);
            if (!i) {
                break;
            }
            // mix in properties
            t = bases[i];
            (t._meta ? mixOwn : mixin)(proto, t.prototype);
            // chain in new constructor
            ctor = new Function;
            ctor.superclass = superclass;
            ctor.prototype = proto;
            superclass = proto.constructor = ctor;
        }
    } else {
        proto = {};
    }

    safeMixin(proto, props);

    t = props.constructor;
    if (t !== op.constructor) {
        t.nom = cname;
        proto.constructor = t;
    }

    for (i = mixins - 1; i; --i) {
        t = bases[i]._meta;
        if(t && t.chains){
            chains = mixin(chains || {}, t.chains);
        }
    }
    if(proto["-chains-"]){
        chains = mixin(chains || {}, proto["-chains-"]);
    }

    t = !chains || !chains.hasOwnProperty(cname);
    bases[0] = ctor = (chains && chains.constructor === "manual") ? simpleConstructor(bases) :
        (bases.length == 1 ? singleConstructor(props.constructor, t) : chainedConstructor(bases, t));
//        bases[0] = ctor = bases.length == 1 ? singleConstructor(props.constructor, true) : chainedConstructor(bases, true);

    ctor._meta = {
        bases : bases,
        hidden : props,
        chains : chains,
        parents : parents,
        ctor : props.constructor
    };
    ctor.superclass = superclass && superclass.prototype;
    ctor.extend = extend;
    ctor.prototype = proto;
    proto.constructor = ctor;

    proto.inherited = inherited;

    if (className) {
        proto.delcaredClass = className;
    }

    if(chains){
        for(name in chains){
            if(proto[name] && typeof chains[name] == "string" && name != cname){
                t = proto[name] = chain(name, bases, chains[name] === "after");
                t.nom = name;
            }
        }
    }
    return ctor;
}

// forceNew(ctor)
// return a new object that inherits from ctor.prototype but
// without actually running ctor on the object.
function forceNew(ctor){
    // create object with correct prototype using a do-nothing
    // constructor
    xtor.prototype = ctor.prototype;
    var t = new xtor;
    xtor.prototype = null;	// clean up
    return t;
}

// applyNew(args)
// just like 'new ctor()' except that the constructor and its arguments come
// from args, which must be an array or an arguments object
function applyNew(args){
    // create an object with ctor's prototype but without
    // calling ctor on it.
    var ctor = args.callee, t = forceNew(ctor);
    // execute the real constructor on the new object
    ctor.apply(t, args);
    return t;
}

function singleConstructor(ctor, ctorSpecial){
    return function() {
        var a = arguments, t = a, a0 = a[0], f;

        if (!(this instanceof a.callee)) {
            return applyNew(a);
        }

        if(ctorSpecial){
            // full blown ritual
            if(a0){
                // process the preamble of the 1st argument
                f = a0.preamble;
                if(f){
                    t = f.apply(this, t) || t;
                }
            }
            f = this.preamble;
            if(f){
                // process the preamble of this class
                f.apply(this, t);
                // one peculiarity of the preamble:
                // it is called even if it is not needed,
                // e.g., there is no constructor to call
                // let's watch for the last constructor
                // (see ticket #9795)
            }
        }

        if (ctor) {
            ctor.apply(this, a);
        }

        f = this.postscript;
        if(f){
            f.apply(this, a);
        }
    };
}

function chainedConstructor(bases, ctorSpecial){
    return function(){
        var a = arguments, args = a, a0 = a[0], f, i, m,
            l = bases.length, preArgs;

        if(!(this instanceof a.callee)){
            // not called via new, so force it
            return applyNew(a);
        }

        //this._inherited = {};
        // perform the shaman's rituals of the original declare()
        // 1) call two types of the preamble
        if(ctorSpecial && (a0 && a0.preamble || this.preamble)){
            // full blown ritual
            preArgs = new Array(bases.length);
            // prepare parameters
            preArgs[0] = a;
            for(i = 0;;){
                // process the preamble of the 1st argument
                a0 = a[0];
                if(a0){
                    f = a0.preamble;
                    if(f){
                        a = f.apply(this, a) || a;
                    }
                }
                // process the preamble of this class
                f = bases[i].prototype;
                f = f.hasOwnProperty("preamble") && f.preamble;
                if(f){
                    a = f.apply(this, a) || a;
                }
                // one peculiarity of the preamble:
                // it is called if it is not needed,
                // e.g., there is no constructor to call
                // let's watch for the last constructor
                // (see ticket #9795)
                if(++i == l){
                    break;
                }
                preArgs[i] = a;
            }
        }
        // 2) call all non-trivial constructors using prepared arguments
        for(i = l - 1; i >= 0; --i){
            f = bases[i];
            m = f._meta;
            f = m ? m.ctor : f;
            if(f){
                f.apply(this, preArgs ? preArgs[i] : a);
            }
        }
        // 3) continue the original ritual: call the postscript
        f = this.postscript;
        if(f){
            f.apply(this, args);
        }
    };
}

function simpleConstructor(bases){
    return function(){
        var a = arguments, i = 0, f, m;

        if(!(this instanceof a.callee)){
            // not called via new, so force it
            return applyNew(a);
        }

        //this._inherited = {};
        // perform the shaman's rituals of the original declare()
        // 1) do not call the preamble
        // 2) call the top constructor (it can use this.inherited())
        for(; f = bases[i]; ++i){ // intentional assignment
            m = f._meta;
            f = m ? m.ctor : f;
            if(f){
                f.apply(this, a);
                break;
            }
        }
        // 3) call the postscript
        f = this.postscript;
        if(f){
            f.apply(this, a);
        }
    };
}

function safeMixin(target, source) {
    var name, t;
    // add props adding metadata for incoming functions skipping a constructor
    for(name in source){
        t = source[name];
        if((t !== op[name] || !(name in op)) && name != cname){
            if(opts.call(t) == "[object Function]"){
                // non-trivial function method => attach its name
                t.nom = name;
            }
            target[name] = t;
        }
    }
    if(hasBugForInSkip()){
        for(var i= _extraLen; i;){
            name = _extraNames[--i];
            t = source[name];
            if((t !== op[name] || !(name in op)) && name != cname){
                if(opts.call(t) == "[object Function]"){
                    // non-trivial function method => attach its name
                    t.nom = name;
                }
                target[name] = t;
            }
        }
    }
    return target;
}

function mixin(target, sources) {
    target = target || {};
    for (var i = 1, l = arguments.length; i < l; ++i) {
        _mixin(target, arguments[i]);
    }
    return target;
}

function _mixin(dest, source) {
    var name, s, i, empty = {};
    for(name in source){
        // the (!(name in empty) || empty[name] !== s) condition avoids copying properties in "source"
        // inherited from Object.prototype.	 For example, if dest has a custom toString() method,
        // don't overwrite it with the toString() method that source inherited from Object.prototype
        s = source[name];
        if(!(name in dest) || (dest[name] !== s && (!(name in empty) || empty[name] !== s))){
            dest[name] = s;
        }
    }

    if(hasBugForInSkip()){
        if(source){
            for(i = 0; i < _extraLen; ++i){
                name = _extraNames[i];
                s = source[name];
                if(!(name in dest) || (dest[name] !== s && (!(name in empty) || empty[name] !== s))){
                    dest[name] = s;
                }
            }
        }
    }

    return dest; // Object
}

function mixOwn(target, source) {
    // add props adding metadata for incoming functions skipping a constructor
    for(var name in source){
        if(name != cname && source.hasOwnProperty(name)){
            target[name] = source[name];
        }
    }
    if(hasBugForInSkip()){
        for(var i= _extraLen; i;){
            name = _extraNames[--i];
            if(name != cname && source.hasOwnProperty(name)){
                target[name] = source[name];
            }
        }
    }
}

function extend(source){
    declare.safeMixin(this.prototype, source);
    return this;
}

function hasBugForInSkip() {
    for (var i in {toString : 1}) {
        return 0;
    }
    return 1;
}

function chain(name, bases, reversed){
    return function(){
        var b, m, f, i = 0, step = 1;
        if(reversed){
            i = bases.length - 1;
            step = -1;
        }
        for(; b = bases[i]; i += step){ // intentional assignment
            m = b._meta;
            f = (m ? m.hidden : b.prototype)[name];
            if(f){
                f.apply(this, arguments);
            }
        }
    };
}

function inherited(args, a, f){
    var name, chains, bases, caller, meta, base, proto, opf, pos,
        cache = this._inherited = this._inherited || {};

    // crack arguments
    if(typeof args == "string"){
        name = args;
        args = a;
        a = f;
    }
    f = 0;

    caller = args.callee;
    name = name || caller.nom;
    if(!name){
        err("can't deduce a name to call inherited()", this.declaredClass);
    }

    meta = this.constructor._meta;
    bases = meta.bases;

    pos = cache.p;
    if(name != cname){
        // method
        if(cache.c !== caller){
            // cache bust
            pos = 0;
            base = bases[0];
            meta = base._meta;
            if(meta.hidden[name] !== caller){
                // error detection
                chains = meta.chains;
                if(chains && typeof chains[name] == "string"){
                    err("calling chained method with inherited: " + name, this.declaredClass);
                }
                // find caller
                do{
                    meta = base._meta;
                    proto = base.prototype;
                    if(meta && (proto[name] === caller && proto.hasOwnProperty(name) || meta.hidden[name] === caller)){
                        break;
                    }
                }while(base = bases[++pos]); // intentional assignment
                pos = base ? pos : -1;
            }
        }
        // find next
        base = bases[++pos];
        if(base){
            proto = base.prototype;
            if(base._meta && proto.hasOwnProperty(name)){
                f = proto[name];
            }else{
                opf = op[name];
                do{
                    proto = base.prototype;
                    f = proto[name];
                    if(f && (base._meta ? proto.hasOwnProperty(name) : f !== opf)){
                        break;
                    }
                }while(base = bases[++pos]); // intentional assignment
            }
        }
        f = base && f || op[name];
    }else{
        // constructor
        if(cache.c !== caller){
            // cache bust
            pos = 0;
            meta = bases[0]._meta;
            if(meta && meta.ctor !== caller){
                // error detection
                chains = meta.chains;
                if(!chains || chains.constructor !== "manual"){
                    err("calling chained constructor with inherited", this.declaredClass);
                }
                // find caller
                while(base = bases[++pos]){ // intentional assignment
                    meta = base._meta;
                    if(meta && meta.ctor === caller){
                        break;
                    }
                }
                pos = base ? pos : -1;
            }
        }
        // find next
        while(base = bases[++pos]){	// intentional assignment
            meta = base._meta;
            f = meta ? meta.ctor : base;
            if(f){
                break;
            }
        }
        f = base && f;
    }

    // cache the found super method
    cache.c = f;
    cache.p = pos;

    // now we have the result
    if(f){
        return a === true ? f : f.apply(this, a || args);
    }
    // intentionally no return if a super method was not found
}

declare.safeMixin = safeMixin;
declare.mixin = mixin;
module.exports = declare;

(function(root, factory){
    if (typeof define === 'function' && define.amd) {
        // AMD
        define(factory);
    } else if (typeof exports === 'object') {
        // Node, CommonJS-like
        module.exports = factory();
    } else {
        // Browser globals (root is window)
        root.declare = factory();
    }
})(this, function(){
    return declare;
});