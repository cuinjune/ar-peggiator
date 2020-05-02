#include "hello.h"
#include <new>

t_class *Hello::pdClass;

void *Hello::newMethod(t_symbol *s, int argc, t_atom *argv) {
    post("HELLO!!!");
    return this;
}

void Hello::bangMethod() {
    post("BANG RECEIVED!!!");
}

void Hello::floatMethod(t_floatarg f) {
}

void Hello::symbolMethod(t_symbol *s) {
}

void Hello::pointerMethod(t_gpointer *p) {
}

void Hello::listMethod(t_symbol *s, int argc, t_atom *argv) {
}

void Hello::anythingMethod(t_symbol *s, int argc, t_atom *argv) {
}

void Hello::dspMethod(t_signal **sp) {
}

void Hello::freeMethod() {
}

void *Hello::newWrapper(t_symbol *s, int argc, t_atom *argv) {
    Hello *x = reinterpret_cast<Hello *>(pd_new(pdClass));
    new (x) Hello();
    return x->newMethod(s, argc, argv);
}

void Hello::bangWrapper(Hello *x) {
    x->bangMethod();
}

void Hello::floatWrapper(Hello *x, t_floatarg f) {
    x->floatMethod(f);
}

void Hello::symbolWrapper(Hello *x, t_symbol *s) {
    x->symbolMethod(s);
}

void Hello::pointerWrapper(Hello *x, t_gpointer *p) {
    x->pointerMethod(p);
}

void Hello::listWrapper(Hello *x, t_symbol *s, int argc, t_atom *argv) {
    x->listMethod(s, argc, argv);
}

void Hello::anythingWrapper(Hello *x, t_symbol *s, int argc, t_atom *argv) {
    x->anythingMethod(s, argc, argv);
}

void Hello::dspWrapper(Hello *x, t_signal **sp) {
    x->dspMethod(sp);
}

void Hello::freeWrapper(Hello *x) {
    x->freeMethod();
    x->~Hello();
}

void Hello::setup() {
    pdClass = class_new(gensym("hello"),
                        reinterpret_cast<t_newmethod>(newWrapper),
                        reinterpret_cast<t_method>(freeWrapper),
                        sizeof(Hello), 0, A_GIMME, 0);
    CLASS_MAINSIGNALIN(pdClass, Hello, mainSignalInletValue);
    class_addbang(pdClass, bangWrapper);
    class_addfloat(pdClass, floatWrapper);
    class_addsymbol(pdClass, symbolWrapper);
    class_addpointer(pdClass, pointerWrapper);
    class_addlist(pdClass, listWrapper);
    class_addanything(pdClass, anythingWrapper);
    class_addmethod(pdClass, reinterpret_cast<t_method>(dspWrapper), gensym("dsp"), A_CANT, 0);
}
